// Nova SDK 端到端测试：连接本地测试节点（run_local_node.py 启动，端口 18081），真实上链验证全部模块。
// 运行：node sdk/test/nova-sdk-e2e.js
const sdk = require('../nova-sdk-open.js');
const NODE = 'http://127.0.0.1:18081';
const PASS = [];
const FAIL = [];

function check(name, cond, extra) {
  (cond ? PASS : FAIL).push(name + (cond ? '' : ' ❌' + (extra ? ' :: ' + JSON.stringify(extra) : '')));
  console.log((cond ? '✅' : '❌') + ' ' + name + (cond ? '' : (extra ? ' :: ' + JSON.stringify(extra) : '')));
}

(async () => {
  const wallet = await sdk.NovaWallet.fromPrivateKey('11'.repeat(32), { nodeUrl: NODE });
  const addr = wallet.address;
  check('wallet address', addr === '0xb86a48fe63a9e65ee72bd7245bb62fe1e0751084', addr);

  // balance
  const bal = await wallet.getBalance();
  check('balance == 20000', Number(bal.balance) === 20000, bal);

  // staking
  const staking = new sdk.NovaStaking(wallet, { rpc: wallet.rpc });
  const stakeRes = await staking.stake(100);
  check('stake 100', !!(stakeRes && stakeRes.txid), stakeRes);
  const st = await staking.rewards();
  check('stake recorded', Number(st.stake || 0) >= 100, st);

  // checkin (无签名)
  const ci = await staking.checkin('sdk-test-fp');
  check('checkin', !(ci && ci.error), ci);

  // contract deploy + query
  const contract = new sdk.NovaContract(wallet, { rpc: wallet.rpc });
  const bytecode = 'music_revenue:split90:10;payments:3';
  const dep = await contract.deploy(bytecode, addr);
  check('deploy contract', !!(dep && dep.contract), dep);
  const q = await contract.query(dep.contract);
  check('contract query is_contract', q.is_contract === true && q.creator === addr, q);

  // oracle: register node + VRF request + price update + AI verify
  const oracle = new sdk.NovaOracle(wallet, { rpc: wallet.rpc });
  const vrfPub = '0x' + 'ab'.repeat(64);
  const reg = await oracle.registerNode(vrfPub, 500);
  check('oracle node register', !!(reg && reg.txid), reg);
  const vrf = await oracle.requestVrf('盲盒抽奖 #12');
  check('vrf request', !!(vrf && (vrf.id || vrf.target)), vrf);
  const vr = await oracle.getVrfResult(vrf.id || vrf.target);
  check('vrf status pending', vr.status === 'pending', vr);
  const p1 = await oracle.updatePrice('USDT/USD', 'chainlink', 1.0);
  const p2 = await oracle.updatePrice('USDT/USD', 'pyth', 1.0001);
  const p3 = await oracle.updatePrice('USDT/USD', 'binance', 0.9999);
  check('price update', !!(p1 && p1.txid && p2 && p2.txid && p3 && p3.txid));
  const feed = await oracle.price('USDT/USD');
  check('price aggregated', feed.price != null && Number(feed.price) > 0.99, feed);
  const ai = await oracle.submitAi('0x' + 'cd'.repeat(32), { kind: 'music' });
  check('ai submit', !!(ai && ai.txid), ai);
  const aiOk = await oracle.verifyAi('0x' + 'cd'.repeat(32), true);
  check('ai verify', !!(aiOk && aiOk.txid), aiOk);
  const aiSt = await oracle.aiStatus('0x' + 'cd'.repeat(32));
  check('ai status verified', aiSt.status === 'verified', aiSt);

  // bridge: withdraw NOVA -> BSC
  const bridge = new sdk.NovaBridge(wallet, { rpc: wallet.rpc });
  const wd = await bridge.withdraw('NOVA', 'BSC', '0x' + '12'.repeat(20), 10);
  check('bridge withdraw NOVA', !!(wd && (wd.id || wd.target)), wd);
  const bsum = await bridge.summary();
  check('bridge summary withdrawals >= 1', bsum.withdrawals >= 1, bsum);

  // dex: create pair + quote (read-only)
  const dex = new sdk.NovaDex(wallet, { rpc: wallet.rpc });
  const pair = await dex.createPair('NOVA/USDT');
  check('dex createPair', !!(pair && pair.txid), pair);
  const dsum = await dex.summary();
  check('dex summary has pair', !!(dsum.pairs && dsum.pairs['NOVA/USDT']), dsum);

  // governance: propose + delegate + power
  const gov = new sdk.NovaGovernance(wallet, { rpc: wallet.rpc });
  const prop = await gov.propose({ ptype: 'param', title: '调整最低质押门槛至 100 NOVA', target: 'economy', key: 'MIN_STAKE', value: 100 });
  check('gov propose', !!(prop && (prop.id || prop.target)), prop);
  const power = await gov.power(addr);
  check('gov power >= 1000', Number(power.voting_power) >= 1000, power);
  const gsum = await gov.summary();
  check('gov summary proposals >= 1', gsum.proposals >= 1, gsum);

  // did: bind + reputation
  const did = new sdk.NovaDID(wallet, { rpc: wallet.rpc });
  const bind = await did.bind('email', '0x' + 'ef'.repeat(32), true);
  check('did bind', !!(bind && bind.txid), bind);
  const rep = await did.reputation(addr);
  check('did reputation score >= 50', Number(rep.score) >= 50, rep);

  // subscription: creator tiers + subscribe
  const sub = new sdk.NovaSubscription(wallet, { rpc: wallet.rpc });
  const tiers = [{ id: 'basic', name: '基础会员', price: 5, period: 'monthly', benefits: ['专属内容'] }];
  const createSub = await sub.createCreator(tiers);
  check('sub createCreator', !!(createSub && createSub.txid), createSub);
  const status = await sub.status(addr, addr);
  check('sub creator status ok', status && (status.status === 'none' || status.status === 'active'), status);

  // content: publish public content
  const content = new sdk.NovaContent(wallet, { rpc: wallet.rpc });
  const pub = await content.publish({ title: '我的第一首歌', content: '加密正文...', price: 10, visibility: 'public', tier: 'basic' });
  check('content publish', !!(pub && pub.txid), pub);

  // events: one-shot poll
  const events = new sdk.NovaEvents({ rpc: wallet.rpc });
  let gotTx = false;
  events.onTx(t => { gotTx = true; });
  await events._poll();
  check('events poll returns txs', Array.isArray((await events._poll()).txs));

  // faucet: status + claim（无需签名，节点侧限频）
  const faucet = new sdk.NovaFaucet(wallet.rpc);
  const fst = await faucet.status();
  check('faucet status enabled', fst.enabled === true && Number(fst.amount) === 100, fst);
  const balBefore = Number((await wallet.getBalance()).balance);
  const fclaim = await faucet.request(addr);
  check('faucet claim +100', Number(fclaim.amount) === 100 && Number(fclaim.balance) >= balBefore + 100 - 0.001, fclaim);
  const fdup = await faucet.request(addr).then(function () { return 'allowed'; }, function (e) { return String(e && e.message || e); });
  check('faucet duplicate rejected', /已领取/.test(fdup) || /24 小时/.test(fdup), fdup);

  const chain = new sdk.NovaChain(wallet.rpc);
  const stats = await chain.stats();
  check('chain stats total_txs >= 1', Number(stats.total_txs) >= 1, stats);
  const sr = await chain.search(addr);
  check('chain search finds address', Array.isArray(sr.results));

  console.log('\nPASS=' + PASS.length + ' FAIL=' + FAIL.length);
  process.exit(FAIL.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
