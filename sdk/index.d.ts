/**
 * Nova 娱乐链官方 SDK 类型声明（@nova/sdk）
 * 覆盖：钱包 / 合约 / 内容交易 / 质押激励 / 订阅会员 / 预言机 / 跨链桥 / DEX / 治理 / DID / 链浏览器 / 事件 / 水龙头
 */

export const VERSION: string;
export const NOVA_DERIVATION_PATH: string;

export const ERR: { NOT_CONNECTED: number; INVALID_ARG: number; RPC_ERROR: number };

export interface RpcOptions { nodeUrl?: string; timeout?: number; }

export class RpcClient {
  constructor(opts?: RpcOptions);
  get(path: string): Promise<any>;
  post(path: string, body?: any): Promise<any>;
}

export interface WalletOpts { nodeUrl?: string; rpc?: RpcClient; }

export class NovaWallet {
  constructor(privOrMnemonic: string, opts?: WalletOpts);
  static create(opts?: WalletOpts): Promise<NovaWallet>;
  static fromMnemonic(mnemonic: string, opts?: WalletOpts): Promise<NovaWallet>;
  static fromPrivateKey(privHex: string, opts?: WalletOpts): Promise<NovaWallet>;
  ready(): boolean;
  getPrivateKey(): string;
  getPublicKey(): string;
  getAddress(): string;
  getMnemonic(): string | null;
  signMessage(msg: string): Promise<string>;
  signHex(hex: string): Promise<string>;
  verifyMessage(msg: string, sigHex: string, pubHex: string): Promise<boolean>;
  signTransaction(tx: any): Promise<string>;
  send(opts: { to: string; amount: number; data?: string }): Promise<any>;
  getBalance(addr?: string): Promise<any>;
  getTxs(addr?: string, limit?: number): Promise<any>;
  getStatus(): Promise<any>;
  moduleOp(module: string, op: string, fields?: Record<string, any>, amount?: number): Promise<any>;
  socialOp(op: string, fields?: Record<string, any>, amount?: number): Promise<any>;
  readonly address: string;
  readonly rpc: RpcClient;
}

export class NovaContract {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  deploy(bytecode: string, creator?: string): Promise<any>;
  call(opts: { to: string; method?: string; args?: any[]; amount?: number }): Promise<any>;
  query(contractAddr: string): Promise<any>;
}

export class NovaStaking {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  stake(amount: number): Promise<any>;
  unstake(amount: number): Promise<any>;
  claim(): Promise<any>;
  checkin(fingerprint?: string): Promise<any>;
  stakes(): Promise<any>;
  rewards(addr?: string): Promise<any>;
  stats(): Promise<any>;
}

export interface PublishOpts {
  title: string;
  body?: string;
  content?: string;
  price?: number;
  visibility?: 'public' | 'private';
  tier?: string;
  [k: string]: any;
}

export class NovaContent {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  publish(opts: PublishOpts): Promise<any>;
  estimateDeposit(tier: string, addr?: string): Promise<any>;
  textContractPubkey(): Promise<any>;
  search(query: string, opts?: any): Promise<any>;
  list(): Promise<any>;
  buy(opts: { textId: string; [k: string]: any }): Promise<any>;
  unlist(textId: string): Promise<any>;
  destroy(textId: string): Promise<any>;
  complain(textId: string, reason: string): Promise<any>;
}

export interface SubTier { id: string; name: string; price: number; period?: 'monthly' | 'lifetime'; benefits?: string[]; }

export class NovaSubscription {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  createCreator(tiers: SubTier[]): Promise<any>;
  updateTiers(tiers: SubTier[]): Promise<any>;
  subscribe(creator: string, tierId: string, opts?: { autoRenew?: boolean; amount?: number }): Promise<any>;
  renew(creator: string, user?: string): Promise<any>;
  cancel(creator: string): Promise<any>;
  summary(): Promise<any>;
  creator(addr: string): Promise<any>;
  status(user: string, creator: string): Promise<any>;
}

export class NovaOracle {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  registerNode(pubkey: string, amount?: number): Promise<any>;
  exitNode(): Promise<any>;
  claimNode(): Promise<any>;
  requestVrf(hint?: string): Promise<any>;
  fulfillVrf(requestId: string, proof: any): Promise<any>;
  getVrfResult(requestId: string): Promise<any>;
  updatePrice(feed: string, source: string, price: number): Promise<any>;
  report(target: string, feed: string): Promise<any>;
  submitAi(contentHash: string, meta?: any): Promise<any>;
  verifyAi(contentHash: string, verdict: boolean): Promise<any>;
  summary(): Promise<any>;
  price(feed: string): Promise<any>;
  nodes(): Promise<any>;
  aiStatus(contentHash: string): Promise<any>;
}

export class NovaBridge {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  deposit(asset: string, sourceChain: string, sourceTx: string, sourceAddr: string, amount: number, user?: string): Promise<any>;
  withdraw(asset: string, targetChain: string, targetAddr: string, amount: number): Promise<any>;
  registerNode(amount?: number): Promise<any>;
  exitNode(): Promise<any>;
  claimNode(): Promise<any>;
  signDeposit(depositId: string): Promise<any>;
  claimDeposit(depositId: string): Promise<any>;
  signWithdraw(withdrawId: string): Promise<any>;
  confirmWithdraw(withdrawId: string, releaseTx: string): Promise<any>;
  summary(): Promise<any>;
  asset(symbol: string): Promise<any>;
  deposits(): Promise<any>;
  withdrawals(): Promise<any>;
}

export class NovaDex {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  createPair(pairId: string): Promise<any>;
  addLiquidity(pairId: string, amount0: number, amount1: number): Promise<any>;
  removeLiquidity(pairId: string, shares: number, min0?: number, min1?: number): Promise<any>;
  swap(pairId: string, amountIn: number, tokenIn: number, minOut?: number): Promise<any>;
  farmStake(pairId: string, shares: number): Promise<any>;
  farmUnstake(pairId: string, shares: number): Promise<any>;
  farmClaim(pairId: string): Promise<any>;
  quote(pairId: string, amountIn: number, tokenIn: number): Promise<any>;
  splitQuote(pairId: string, amountIn: number, tokenIn: number): Promise<any>;
  summary(): Promise<any>;
  lp(addr?: string): Promise<any>;
  farm(pair: string, addr?: string): Promise<any>;
}

export interface ProposeOpts {
  ptype: string;
  title: string;
  target?: string;
  key?: string;
  value?: any;
  data?: string;
  recipient?: string;
  amount?: number;
  [k: string]: any;
}

export class NovaGovernance {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  propose(opts: ProposeOpts): Promise<any>;
  endorse(proposalId: string): Promise<any>;
  vote(proposalId: string, support: boolean): Promise<any>;
  delegate(to: string): Promise<any>;
  confirm(proposalId: string): Promise<any>;
  execute(proposalId: string): Promise<any>;
  cancel(proposalId: string): Promise<any>;
  summary(): Promise<any>;
  proposals(status?: string): Promise<any>;
  proposal(pid: string): Promise<any>;
  power(addr: string): Promise<any>;
}

export class NovaDID {
  constructor(wallet: NovaWallet, opts?: WalletOpts);
  bind(kind: string, hash: string, visible?: boolean): Promise<any>;
  unbind(kind: string): Promise<any>;
  apply(portfolio: string[], statement?: string): Promise<any>;
  vote(applicant: string, support: boolean): Promise<any>;
  profile(addr: string, viewer?: string): Promise<any>;
  reputation(addr: string, viewer?: string): Promise<any>;
  summary(): Promise<any>;
}

export class NovaChain {
  constructor(rpcOrUrl: RpcClient | string, opts?: RpcOptions);
  block(height: number): Promise<any>;
  search(q: string): Promise<any>;
  stats(): Promise<any>;
  sync(afterHeight?: number): Promise<any>;
  tx(txid: string): Promise<any>;
}

export class NovaEvents {
  constructor(opts?: { rpc?: RpcClient; interval?: number });
  onTx(fn: (tx: any) => void): this;
  onBlock(fn: (block: any) => void): this;
  onContractEvent(fn: (ev: any) => void): this;
  onStats(fn: (stats: any) => void): this;
  start(): this;
  stop(): this;
}

export class NovaFaucet {
  constructor(rpcOrWallet: RpcClient | NovaWallet, opts?: RpcOptions);
  status(): Promise<any>;
  request(addr?: string, fingerprint?: string): Promise<any>;
}

export const utils: {
  bytesToHex(bytes: Uint8Array): string;
  hexToBytes(hex: string): Uint8Array;
  sha3_512Hex(input: string | Uint8Array): string;
  sha256(input: string | Uint8Array): string;
  sha512(input: string | Uint8Array): string;
  canonicalAmount(n: number): string;
  deriveAddress(pubHex: string): string;
  randomBytes(n: number): Uint8Array;
  generateMnemonic(strength?: number): string;
  validateMnemonic(mnemonic: string): boolean;
  entropyToMnemonic(entropy: Uint8Array): string;
  mnemonicToEntropy(mnemonic: string): Uint8Array;
  mnemonicToSeed(mnemonic: string, passphrase?: string): Uint8Array;
  deriveNovaKey(mnemonic: string, passphrase?: string): Promise<any>;
  deriveEd25519FromPath(seed: Uint8Array, path: string): any;
  ed25519PublicKey(seed: Uint8Array): Uint8Array;
  ed25519Sign(msg: Uint8Array, seed: Uint8Array): Uint8Array;
  ed25519Verify(msg: Uint8Array, sig: Uint8Array, pub: Uint8Array): boolean;
  deployAddress(creator: string, nonce: number): string;
};

declare const NovaSDK: {
  VERSION: typeof VERSION;
  NOVA_DERIVATION_PATH: typeof NOVA_DERIVATION_PATH;
  ERR: typeof ERR;
  utils: typeof utils;
  RpcClient: typeof RpcClient;
  NovaWallet: typeof NovaWallet;
  NovaContract: typeof NovaContract;
  NovaContent: typeof NovaContent;
  NovaStaking: typeof NovaStaking;
  NovaSubscription: typeof NovaSubscription;
  NovaOracle: typeof NovaOracle;
  NovaBridge: typeof NovaBridge;
  NovaDex: typeof NovaDex;
  NovaGovernance: typeof NovaGovernance;
  NovaDID: typeof NovaDID;
  NovaChain: typeof NovaChain;
  NovaEvents: typeof NovaEvents;
  NovaFaucet: typeof NovaFaucet;
};

export default NovaSDK;
