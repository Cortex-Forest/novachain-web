/* Nova 娱乐链 JS SDK（@nova/sdk · 开放版）
 * 零依赖、UMD 风格：浏览器 <script> 与 Node/打包器通用。
 * 覆盖：钱包 / 合约 / 内容交易 / 质押激励 / 订阅会员 / 预言机 / 跨链桥 / DEX / 治理 / DID / 链浏览器事件 / 测试网水龙头。
 * 与后端 RPC（/api/*）和链上交易签名格式完全一致：
 *   signing_data = sender + receiver + canonical(amount) + timestamp + parents + data + pub
 * 所有模块操作均为 sender==receiver 的自签名交易，业务字段放 data(JSON)。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.NovaSDK = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* ================= 基础工具 ================= */
  var TE = new TextEncoder();
  var TD = new TextDecoder();

  function bytesToHex(bytes) {
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function hexToBytes(hex) {
    var clean = String(hex || '').replace(/^0x/, '');
    if (!clean) return new Uint8Array();
    var out = new Uint8Array(clean.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }
  function concatBytes() {
    var total = 0, i;
    for (i = 0; i < arguments.length; i++) total += arguments[i].length;
    var out = new Uint8Array(total), p = 0;
    for (i = 0; i < arguments.length; i++) { out.set(arguments[i], p); p += arguments[i].length; }
    return out;
  }
  function randomBytes(n) {
    if (global.crypto && global.crypto.getRandomValues) {
      var out = new Uint8Array(n);
      global.crypto.getRandomValues(out);
      return out;
    }
    if (global.require) {
      var nodeCrypto = global.require('crypto');
      return new Uint8Array(nodeCrypto.randomBytes(n));
    }
    throw new Error('无安全随机源');
  }
  function toArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  function utf8ToBytes(str) { return TE.encode(String(str)); }
  function bytesToUtf8(bytes) { return TD.decode(bytes); }
  function subtle() { return global.crypto && global.crypto.subtle; }
  function requireSubtle() {
    if (!subtle()) throw new Error('当前环境不支持 WebCrypto（需 HTTPS/localhost 或 Node 18+）');
    return subtle();
  }
  async function sha256(bytes) { return new Uint8Array(await requireSubtle().digest('SHA-256', toArrayBuffer(bytes))); }
  async function sha512(bytes) { return new Uint8Array(await requireSubtle().digest('SHA-512', toArrayBuffer(bytes))); }
  async function hmacSha512(keyBytes, dataBytes) {
    var key = await requireSubtle().importKey('raw', toArrayBuffer(keyBytes), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    return new Uint8Array(await requireSubtle().sign('HMAC', key, toArrayBuffer(dataBytes)));
  }
  async function pbkdf2(passwordBytes, saltBytes, iterations, hash, len) {
    var key = await requireSubtle().importKey('raw', toArrayBuffer(passwordBytes), 'PBKDF2', false, ['deriveBits']);
    var bits = await requireSubtle().deriveBits({ name: 'PBKDF2', hash: hash, salt: toArrayBuffer(saltBytes), iterations: iterations }, key, len * 8);
    return new Uint8Array(bits);
  }
  function leBytesToBigInt(bytes) {
    var n = 0n;
    for (var i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
    return n;
  }
  function bigIntToLeBytes(n, len) {
    var out = new Uint8Array(len || 32);
    for (var i = 0; i < out.length; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
    return out;
  }
  function isHex(str, len) {
    if (typeof str !== 'string') return false;
    return new RegExp('^[0-9a-fA-F]{' + len + '}$').test(String(str).replace(/^0x/, ''));
  }

  /* ================= Keccak / SHA3-512（与后端 hashlib.sha3_512 一致） ================= */
  var KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  var KECCAK_ROTC = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  var MASK64 = (1n << 64n) - 1n;
  function rotl64(x, n) { return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64; }
  function keccakF(st) {
    var a = new Array(25), i, x, y, round, j, k;
    for (i = 0; i < 25; i++) {
      var v = 0n;
      for (j = 7; j >= 0; j--) v = (v << 8n) | BigInt(st[i * 8 + j]);
      a[i] = v;
    }
    for (round = 0; round < 24; round++) {
      var c = new Array(5), d = new Array(5);
      for (x = 0; x < 5; x++) c[x] = a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20];
      for (x = 0; x < 5; x++) d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      for (i = 0; i < 25; i++) a[i] ^= d[i % 5];
      var b = new Array(25);
      for (x = 0; x < 5; x++) {
        for (y = 0; y < 5; y++) {
          var idx = x + 5 * y;
          var nx = y;
          var ny = (2 * x + 3 * y) % 5;
          var rot = KECCAK_ROTC[idx];
          b[nx + 5 * ny] = rot ? rotl64(a[idx], rot) : a[idx];
        }
      }
      for (i = 0; i < 25; i++) {
        var yy = Math.floor(i / 5);
        a[i] = b[i] ^ ((~b[(i + 1) % 5 + 5 * yy]) & b[(i + 2) % 5 + 5 * yy]);
      }
      a[0] ^= KECCAK_RC[round];
    }
    var out = new Uint8Array(200);
    for (i = 0; i < 25; i++) {
      v = a[i];
      for (k = 0; k < 8; k++) { out[i * 8 + k] = Number(v & 0xffn); v >>= 8n; }
    }
    return out;
  }
  function sha3_512Bytes(bytes) {
    var rate = 72, outLen = 64;
    var blockCount = Math.ceil((bytes.length + 1) / rate);
    var data = new Uint8Array(blockCount * rate);
    data.set(bytes);
    var lastStart = (blockCount - 1) * rate;
    var pos = bytes.length - lastStart;
    data[lastStart + pos] = 0x06;
    data[lastStart + rate - 1] |= 0x80;
    var state = new Uint8Array(200);
    for (var i = 0; i < blockCount; i++) {
      for (var j = 0; j < rate; j++) state[j] ^= data[i * rate + j];
      state = keccakF(state);
    }
    return state.slice(0, outLen);
  }
  function sha3_512Hex(bytes) { return bytesToHex(sha3_512Bytes(bytes)); }

  /* ================= Ed25519（与后端 core/crypto.py 回退实现一致） ================= */
  var ED_P = (1n << 255n) - 19n;
  var ED_L = (1n << 252n) + 27742317777372353535851937790883648493n;
  var ED_D = (-121665n * modPow(121666n, ED_P - 2n, ED_P)) % ED_P;
  var ED_BX = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
  var ED_BY = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
  var ED_B = [ED_BX, ED_BY, 1n, (ED_BX * ED_BY) % ED_P];

  function modPow(base, exp, mod) {
    var b = base % mod;
    if (b < 0n) b += mod;
    var r = 1n;
    while (exp > 0n) {
      if (exp & 1n) r = (r * b) % mod;
      b = (b * b) % mod;
      exp >>= 1n;
    }
    return r;
  }
  function modP(n) { n %= ED_P; return n < 0n ? n + ED_P : n; }
  function edwardsAdd(p, q) {
    var x1 = p[0], y1 = p[1], z1 = p[2], t1 = p[3];
    var x2 = q[0], y2 = q[1], z2 = q[2], t2 = q[3];
    var a = (y1 - x1) * (y2 - x2) % ED_P;
    var b = (y1 + x1) * (y2 + x2) % ED_P;
    var c = (2n * ED_D * t1 * t2) % ED_P;
    var d = (2n * z1 * z2) % ED_P;
    var e = b - a;
    var f = d - c;
    var g = d + c;
    var h = b + a;
    return [modP(e * f), modP(g * h), modP(f * g), modP(e * h)];
  }
  function edwardsScalarMult(p, e) {
    var q = [0n, 1n, 1n, 0n];
    while (e > 0n) {
      if (e & 1n) q = edwardsAdd(q, p);
      p = edwardsAdd(p, p);
      e >>= 1n;
    }
    return q;
  }
  function edwardsEncode(p) {
    var zInv = modPow(p[2], ED_P - 2n, ED_P);
    var xr = modP(p[0] * zInv);
    var yr = modP(p[1] * zInv);
    var bits = yr | ((xr & 1n) << 255n);
    return bigIntToLeBytes(bits, 32);
  }
  function edwardsClamp(a) {
    a &= (1n << 255n) - 1n - 7n;
    a |= 1n << 254n;
    return a;
  }
  /* 点压缩解码：y = 低 255 位，x 由曲线方程恢复（p % 8 == 5，用 (u/v)^((p+3)/8) 开方）。 */
  function edwardsDecode(bytes) {
    var bits = leBytesToBigInt(bytes);
    var y = bits & ((1n << 255n) - 1n);
    var sign = bits >> 255n;
    if (y >= ED_P) return null;
    var yy = modP(y * y);
    var u = modP(yy - 1n);
    var v = modP(ED_D * yy + 1n);
    if (v === 0n) return null;
    var x = modP(modPow(u, (ED_P + 3n) / 8n, ED_P) * modPow(modPow(v, ED_P - 2n, ED_P), (ED_P + 3n) / 8n, ED_P));
    // 校验 x^2 * v == u（mod p），失败则尝试乘以 sqrt(-1)
    var x2 = modP(x * x);
    if (modP(x2 * v - u) !== 0n) {
      var sqrtM1 = modPow(2n, (ED_P - 1n) / 4n, ED_P);
      x = modP(x * sqrtM1);
      if (modP(x * x * v - u) !== 0n) return null;
    }
    if ((x & 1n) !== sign) x = modP(-x);
    if (x === 0n && sign === 1n) return null;
    return [x, y, 1n, modP(x * y)];
  }
  async function ed25519PublicKey(seedBytes) {
    var h = await sha512(seedBytes);
    var a = edwardsClamp(leBytesToBigInt(h.slice(0, 32)));
    return edwardsEncode(edwardsScalarMult(ED_B, a));
  }
  async function ed25519Sign(seedBytes, msgBytes) {
    var h = await sha512(seedBytes);
    var a = edwardsClamp(leBytesToBigInt(h.slice(0, 32)));
    var prefix = h.slice(32);
    var r = leBytesToBigInt(await sha512(concatBytes(prefix, msgBytes))) % ED_L;
    var pubBytes = await ed25519PublicKey(seedBytes);
    var rBytes = edwardsEncode(edwardsScalarMult(ED_B, r));
    var k = leBytesToBigInt(await sha512(concatBytes(concatBytes(rBytes, pubBytes), msgBytes))) % ED_L;
    var s = (r + k * a) % ED_L;
    return concatBytes(rBytes, bigIntToLeBytes(s, 32));
  }
  async function ed25519Verify(pubBytes, msgBytes, sigBytes) {
    if (pubBytes.length !== 32 || sigBytes.length !== 64) return false;
    var R = edwardsDecode(sigBytes.slice(0, 32));
    if (!R) return false;
    var S = leBytesToBigInt(sigBytes.slice(32, 64));
    if (S >= ED_L) return false;
    var A = edwardsDecode(pubBytes);
    if (!A) return false;
    var k = leBytesToBigInt(await sha512(concatBytes(sigBytes.slice(0, 32), pubBytes, msgBytes))) % ED_L;
    var lhs = edwardsScalarMult(ED_B, S);
    var rhs = edwardsAdd(R, edwardsScalarMult(A, k));
    return edwardsEncode(lhs).every(function (b, i) { return b === edwardsEncode(rhs)[i]; });
  }
  function deriveAddress(pubHex) {
    return '0x' + sha3_512Hex(hexToBytes(pubHex)).substring(0, 40);
  }
  function canonicalAmount(amount) {
    var n = Number(amount || 0);
    if (!isFinite(n)) throw new Error('金额无效');
    return n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  }
  var BIP39_ENGLISH = "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence evil evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee feed feel female fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose improve impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean measure meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning mosquito mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive name napkin narrow nasty nation nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north nose notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain obvious occur ocean october odor off offer office often oil okay old olive olympic omit once one onion online only open opera opinion oppose option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver similar simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort soul sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike spin spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stool story stove strategy street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo";


  var WORDS = BIP39_ENGLISH.trim().split(/\s+/);

  /* ================= BIP39（生成 / 校验 / 转种子） ================= */
  async function entropyToMnemonic(entropyBytes) {
    if (WORDS.length !== 2048) throw new Error('BIP39 词表未初始化');
    var strength = entropyBytes.length * 8;
    if (strength % 32 !== 0 || strength < 128 || strength > 256) throw new Error('无效熵长度');
    var cs = strength / 32;
    var h = await sha256(entropyBytes);
    var bits = [];
    for (var i = 0; i < entropyBytes.length; i++) for (var b = 7; b >= 0; b--) bits.push((entropyBytes[i] >> b) & 1);
    for (var i2 = 0; i2 < cs; i2++) bits.push((h[i2 >> 3] >> (7 - (i2 & 7))) & 1);
    var words = [];
    for (var i3 = 0; i3 < bits.length; i3 += 11) {
      var idx = 0;
      for (var j = 0; j < 11; j++) idx = (idx << 1) | bits[i3 + j];
      words.push(WORDS[idx]);
    }
    return words.join(' ');
  }
  async function generateMnemonic(strength) {
    strength = strength || 128;
    return entropyToMnemonic(randomBytes(strength / 8));
  }
  async function mnemonicToEntropy(mnemonic) {
    if (WORDS.length !== 2048) throw new Error('BIP39 词表未初始化');
    var words = String(mnemonic || '').trim().toLowerCase().split(/\s+/);
    if ([12, 15, 18, 21, 24].indexOf(words.length) < 0) throw new Error('助记词应为 12/15/18/21/24 个单词');
    var bits = [], i, j, idx;
    for (i = 0; i < words.length; i++) {
      idx = WORDS.indexOf(words[i]);
      if (idx < 0) throw new Error('词表不包含单词: ' + words[i]);
      for (j = 10; j >= 0; j--) bits.push((idx >> j) & 1);
    }
    var cs = bits.length / 33;
    var entBits = bits.length - cs;
    var ent = new Uint8Array(entBits / 8);
    for (i = 0; i < entBits; i++) ent[i >> 3] |= bits[i] << (7 - (i & 7));
    var h = await sha256(ent);
    for (i = 0; i < cs; i++) {
      if (bits[entBits + i] !== ((h[i >> 3] >> (7 - (i & 7))) & 1)) throw new Error('助记词校验和错误');
    }
    return ent;
  }
  async function mnemonicToSeed(mnemonic, passphrase) {
    var words = String(mnemonic || '').trim().toLowerCase().split(/\s+/);
    var salt = 'mnemonic' + (passphrase || '');
    return pbkdf2(utf8ToBytes(words.join(' ')), utf8ToBytes(salt), 2048, 'SHA-512', 64);
  }
  async function validateMnemonic(mnemonic) {
    try { await mnemonicToEntropy(mnemonic); return true; } catch (e) { return false; }
  }

  /* ================= SLIP-0010（Ed25519，仅硬化派生） ================= */
  var HARDENED = 0x80000000;
  function ser32(n) {
    var o = new Uint8Array(4);
    o[0] = (n >>> 24) & 0xff; o[1] = (n >>> 16) & 0xff; o[2] = (n >>> 8) & 0xff; o[3] = n & 0xff;
    return o;
  }
  async function slip10Master(seed) {
    var I = await hmacSha512(utf8ToBytes('ed25519 seed'), seed);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
  }
  async function slip10Child(node, index) {
    if (index < HARDENED) throw new Error('Ed25519 派生仅支持硬化路径段');
    var I = await hmacSha512(node.chainCode, concatBytes(new Uint8Array([0]), node.key, ser32(index)));
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
  }
  async function deriveEd25519FromPath(seed, path) {
    var node = await slip10Master(seed);
    var parts = String(path || '').trim().split('/');
    if (parts[0].toLowerCase() !== 'm') throw new Error('派生路径需以 m 开头');
    for (var i = 1; i < parts.length; i++) {
      var seg = parts[i], hardened = false;
      if (seg.charAt(seg.length - 1) === "'") { hardened = true; seg = seg.slice(0, -1); }
      var idx = parseInt(seg, 10);
      if (!isFinite(idx) || idx < 0 || idx >= HARDENED) throw new Error('路径段无效: ' + parts[i]);
      if (hardened) idx += HARDENED;
      node = await slip10Child(node, idx);
    }
    return node.key;
  }
  // Nova 统一派生路径（coin type 223）
  var NOVA_DERIVATION_PATH = "m/44'/223'/0'/0'/0'";
  async function deriveNovaKey(mnemonic, passphrase) {
    var seed = await mnemonicToSeed(mnemonic, passphrase);
    var key = await deriveEd25519FromPath(seed, NOVA_DERIVATION_PATH);
    return bytesToHex(key);
  }

  /* ================= RPC 客户端 ================= */
  function RpcClient(nodeUrl) {
    this.nodeUrl = String(nodeUrl || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    this._seq = 0;
  }
  RpcClient.prototype.get = async function (path) { return this.request('GET', path); };
  RpcClient.prototype.post = async function (path, body) { return this.request('POST', path, body); };
  RpcClient.prototype.request = async function (method, path, body) {
    var url = this.nodeUrl + path;
    var opts = { method: method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    var res = await fetch(url, opts);
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status; err.body = data;
      throw err;
    }
    return data;
  };

  /* ================= NovaWallet：创建 / 助记词 / 私钥 / 签名 / 转账 ================= */
  function NovaWallet(privOrMnemonic, opts) {
    opts = opts || {};
    this.rpc = opts.rpc instanceof RpcClient ? opts.rpc : new RpcClient(opts.nodeUrl);
    this._mnemonic = null;
    var self = this;
    this._ready = (async function () {
      var src = String(privOrMnemonic || '').trim();
      if (!src) throw new Error('需要助记词或私钥');
      var priv;
      if (/^[0-9a-f]{64}$/i.test(src.replace(/^0x/, ''))) {
        priv = src.replace(/^0x/, '').toLowerCase();
      } else if (src.split(/\s+/).length >= 12) {
        self._mnemonic = src.toLowerCase();
        priv = await deriveNovaKey(src);
      } else {
        throw new Error('无法识别的私钥/助记词');
      }
      self.priv = priv;
      self.pub = bytesToHex(await ed25519PublicKey(hexToBytes(priv)));
      self.address = deriveAddress(self.pub);
    })();
  }
  NovaWallet.create = async function (opts) {
    var mnemonic = await generateMnemonic((opts && opts.strength) || 128);
    var w = new NovaWallet(mnemonic, opts);
    await w._ready;
    return w;
  };
  NovaWallet.fromMnemonic = async function (mnemonic, opts) {
    if (!(await validateMnemonic(mnemonic))) throw new Error('助记词校验失败');
    var w = new NovaWallet(mnemonic, opts);
    await w._ready;
    return w;
  };
  NovaWallet.fromPrivateKey = async function (privHex, opts) {
    var w = new NovaWallet(privHex, opts);
    await w._ready;
    return w;
  };
  NovaWallet.prototype.ready = function () { return this._ready; };
  NovaWallet.prototype.getPrivateKey = function () { return this.priv; };
  NovaWallet.prototype.getPublicKey = function () { return this.pub; };
  NovaWallet.prototype.getAddress = function () { return this.address; };
  NovaWallet.prototype.getMnemonic = function () { return this._mnemonic; };
  NovaWallet.prototype.signMessage = async function (msg) {
    return bytesToHex(await ed25519Sign(hexToBytes(this.priv), utf8ToBytes(String(msg))));
  };
  NovaWallet.prototype.signHex = async function (hex) {
    return bytesToHex(await ed25519Sign(hexToBytes(this.priv), hexToBytes(hex)));
  };
  NovaWallet.prototype.verifyMessage = async function (msg, sigHex, pubHex) {
    return ed25519Verify(hexToBytes(pubHex), utf8ToBytes(String(msg)), hexToBytes(sigHex));
  };
  /* 构造并签名交易：与后端 Tx.signing_data() 完全一致。 */
  NovaWallet.prototype.signTransaction = async function (tx) {
    var sender = tx.sender || this.address;
    var receiver = tx.receiver || sender;
    var amount = canonicalAmount(tx.amount || 0);
    var ts = (tx.timestamp != null ? Math.floor(Number(tx.timestamp)) : Math.floor(Date.now() / 1000));
    var parents = JSON.stringify(tx.parents || []);
    var data = tx.data != null ? String(tx.data) : '';
    var msg = sender + receiver + amount + ts + parents + data + this.pub;
    var signature = await this.signMessage(msg);
    return {
      sender: sender, receiver: receiver, amount: Number(amount), timestamp: ts,
      parents: tx.parents || [], data: data,
      sender_public_key: this.pub, signature: signature
    };
  };
  /* 通用转账：POST /api/send */
  NovaWallet.prototype.send = async function (opts) {
    var tx = await this.signTransaction({
      sender: this.address, receiver: opts.to, amount: opts.amount,
      data: opts.memo || '', timestamp: opts.timestamp
    });
    return this.rpc.post('/api/send', tx);
  };
  NovaWallet.prototype.getBalance = async function (addr) {
    return this.rpc.get('/api/balance/' + (addr || this.address));
  };
  NovaWallet.prototype.getTxs = async function (addr, limit) {
    var q = limit ? '?limit=' + limit : '';
    return this.rpc.get('/api/txs/' + (addr || this.address) + q);
  };
  NovaWallet.prototype.getStatus = async function () { return this.rpc.get('/api/status'); };
  /* 通用模块操作：POST /api/<module>/op（sender==receiver，业务字段放 data JSON） */
  NovaWallet.prototype.moduleOp = async function (module, op, fields, amount) {
    var data = JSON.stringify(Object.assign({ op: op }, fields || {}));
    var tx = await this.signTransaction({
      sender: this.address, receiver: this.address,
      amount: Number(amount || 0), data: data
    });
    var res = await this.rpc.post('/api/' + module + '/op', {
      addr: this.address, amount: tx.amount, data: tx.data, timestamp: tx.timestamp,
      sender_public_key: tx.sender_public_key, signature: tx.signature
    });
    if (res && res.error) throw new Error(res.error);
    return res;
  };
  /* 通用 SocialFi 操作：POST /api/op */
  NovaWallet.prototype.socialOp = async function (op, fields, amount) {
    var data = JSON.stringify(Object.assign({ op: op }, fields || {}));
    var tx = await this.signTransaction({
      sender: this.address, receiver: this.address,
      amount: Number(amount || 0), data: data
    });
    var res = await this.rpc.post('/api/op', {
      addr: this.address, amount: tx.amount, data: tx.data, timestamp: tx.timestamp,
      sender_public_key: tx.sender_public_key, signature: tx.signature
    });
    if (res && res.error) throw new Error(res.error);
    return res;
  };

  /* ================= NovaContract：部署 / 调用 / 查询 ================= */
  function NovaContract(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  /* 部署合约：POST /api/deploy。creator 缺省时不签名（系统部署）；传入则用钱包签名。 */
  NovaContract.prototype.deploy = async function (bytecode, creator) {
    var body = { bytecode: bytecode };
    if (creator) {
      body.creator = creator;
      var addr = deployAddress(bytecode);
      var msg = 'deploy:' + addr + ':' + bytecode;
      body.signature = await this.wallet.signMessage(msg);
      body.sender_public_key = this.wallet.pub;
    }
    var res = await this.rpc.post('/api/deploy', body);
    if (res && res.error) throw new Error(res.error);
    return res;
  };
  /* 调用合约方法：POST /api/call（sender -> contract，message 为调用数据） */
  NovaContract.prototype.call = async function (opts) {
    var tx = await this.wallet.signTransaction({
      sender: this.wallet.address, receiver: opts.contract,
      amount: opts.amount || 0, data: opts.message || ''
    });
    var body = {
      sender: tx.sender, contract: tx.receiver, amount: tx.amount,
      message: tx.data, timestamp: tx.timestamp,
      sender_public_key: tx.sender_public_key, signature: tx.signature
    };
    var res = await this.rpc.post('/api/call', body);
    if (res && res.error) throw new Error(res.error);
    return res;
  };
  /* 查询合约状态 / 合约信息：GET /api/contract/{addr} */
  NovaContract.prototype.query = function (contractAddr) {
    return this.rpc.get('/api/contract/' + contractAddr);
  };
  /* 从字节码确定性计算合约地址（与后端 deploy_address 一致：sha3_256(bytecode)） */
  function deployAddress(bytecode) {
    // 后端 deploy_address：0x + sha3_256(bytecode).hexdigest()[:40]
    return '0x' + sha3_256Hex(utf8ToBytes(bytecode)).substring(0, 40);
  }
  function sha3_256Hex(bytes) {
    // keccak/sha3-256：rate 136B，填充 0x06（FIPS 202）
    var rate = 136, outLen = 32;
    var blockCount = Math.ceil((bytes.length + 1) / rate);
    var data = new Uint8Array(blockCount * rate);
    data.set(bytes);
    var lastStart = (blockCount - 1) * rate;
    var pos = bytes.length - lastStart;
    data[lastStart + pos] = 0x06;
    data[lastStart + rate - 1] |= 0x80;
    var state = new Uint8Array(200);
    for (var i = 0; i < blockCount; i++) {
      for (var j = 0; j < rate; j++) state[j] ^= data[i * rate + j];
      state = keccakF(state);
    }
    return bytesToHex(state.slice(0, outLen));
  }

  /* ================= NovaStaking：质押 / 解质押 / 签到 / 奖励 ================= */
  function NovaStaking(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  NovaStaking.prototype._stakePost = async function (path, data, amount) {
    var tx = await this.wallet.signTransaction({
      sender: this.wallet.address, receiver: this.wallet.address,
      amount: amount || 0, data: data
    });
    var body = {
      addr: this.wallet.address, amount: Number(amount || 0), timestamp: tx.timestamp,
      sender_public_key: this.wallet.pub, signature: tx.signature
    };
    var res = await this.rpc.post(path, body);
    if (res && res.error) throw new Error(res.error);
    return res;
  };
  NovaStaking.prototype.stake = function (amount) { return this._stakePost('/api/stake', 'nova:stake', amount); };
  NovaStaking.prototype.unstake = function (amount) { return this._stakePost('/api/unstake', 'nova:unstake', amount); };
  NovaStaking.prototype.claim = function () { return this._stakePost('/api/claim', 'nova:claim', 0); };
  NovaStaking.prototype.checkin = async function (fingerprint) {
    var res = await this.rpc.post('/api/checkin', { addr: this.wallet.address, fingerprint: fingerprint || '' });
    if (res && res.error) throw new Error(res.error);
    return res;
  };
  NovaStaking.prototype.stakes = function () { return this.rpc.get('/api/stakes'); };
  NovaStaking.prototype.rewards = async function (addr) {
    var d = await this.rpc.get('/api/stakes');
    return { stake: d.stakes[addr || this.wallet.address] || 0, total: d.total };
  };
  NovaStaking.prototype.stats = function () { return this.rpc.get('/api/stats'); };

  /* ================= NovaContent：发布密文 / 搜索 / 购买 ================= */
  var TEXT_DEPOSIT_TIERS = { basic: 10, advanced: 100, pro: 1000 };
  function NovaContent(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  /* 发布内容：op=nova:text:create（公开/密文），amount 为保证金（信誉高自动打折，可传 deposit 覆盖）。 */
  NovaContent.prototype.publish = async function (opts) {
    var fields = {
      title: opts.title,
      visibility: opts.visibility || 'public',
      tier: opts.tier || 'basic',
      price: opts.price != null ? opts.price : 0
    };
    if (opts.identifier) fields.identifier = opts.identifier;
    if (opts.cid) { fields.cid = opts.cid; fields.size_gb = opts.size_gb; fields.duration_days = opts.duration_days; }
    if (opts.visibility === 'sealed') {
      if (opts.cipher_cid) fields.cipher_cid = opts.cipher_cid;
      if (opts.cipher_data) fields.cipher_data = opts.cipher_data;
      if (opts.key_cipher) fields.key_cipher = opts.key_cipher;
      if (!fields.cipher_cid && !fields.cipher_data) throw new Error('密文内容需要 cipher_cid 或 cipher_data');
      if (!fields.key_cipher) throw new Error('密文内容需要 key_cipher（用文本合约公钥 ECIES 加密正文密钥）');
    } else {
      if (!opts.content) throw new Error('公开内容需要 content 正文');
      fields.content = opts.content;
    }
    var deposit = opts.deposit != null ? opts.deposit : await this.estimateDeposit(fields.tier, this.wallet.address);
    var res = await this.wallet.socialOp('nova:text:create', fields, deposit);
    return res;
  };
  /* 估算保证金：文本信誉分 >= 80 时下调至 50%（与链上 text_deposit_required 一致，
     信誉分取 /api/socialfi/text 返回的链上 text_reputation）。 */
  NovaContent.prototype.estimateDeposit = async function (tier, addr) {
    var base = TEXT_DEPOSIT_TIERS[tier] || TEXT_DEPOSIT_TIERS.basic;
    try {
      var d = await this.rpc.get('/api/socialfi/text');
      var addr2 = addr || this.wallet.address;
      var score = Number((d.reputation || {})[addr2] || 0);
      return Number((base * (1 - 0.5 * Math.min(1, score / 80))).toFixed(8));
    } catch (e) { return base; }
  };
  /* 文本合约公钥（密文发布用）：GET /api/text/key */
  NovaContent.prototype.textContractPubkey = function () { return this.rpc.get('/api/text/key'); };
  /* 搜索内容：拉取 /api/socialfi/text 后按标题/标识/作者过滤 */
  NovaContent.prototype.search = async function (query, opts) {
    var d = await this.rpc.get('/api/socialfi/text');
    var assets = Object.keys(d.assets || {}).map(function (k) { return d.assets[k]; });
    var q = String(query || '').trim().toLowerCase();
    var out = assets;
    if (q) {
      out = assets.filter(function (a) {
        return (String(a.title || '').toLowerCase().indexOf(q) >= 0)
          || (String(a.identifier || '').toLowerCase().indexOf(q) >= 0)
          || (String(a.author || '').toLowerCase().indexOf(q) >= 0);
      });
    }
    out.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
    var limit = opts && opts.limit ? opts.limit : 50;
    return { assets: out.slice(0, limit), total: out.length, contract_pubkey: d.contract_pubkey };
  };
  NovaContent.prototype.list = async function () { return this.rpc.get('/api/socialfi/text'); };
  /* 购买内容：op=nova:text:buy（密文需 buyer_pub=P256 公钥，用 WebCrypto 生成） */
  NovaContent.prototype.buy = async function (opts) {
    var fields = { text_id: opts.textId };
    var amount = opts.amount;
    if (opts.sealed) {
      fields.buyer_pub = await generateP256PublicKey();
      if (amount == null) throw new Error('密文购买需提供 amount（内容价格）');
    }
    if (amount == null) amount = 0;
    return this.wallet.socialOp('nova:text:buy', fields, amount);
  };
  /* 下架 / 销毁 / 投诉（作者与买家操作） */
  NovaContent.prototype.unlist = function (textId) { return this.wallet.socialOp('nova:text:unlist', { text_id: textId }, 0); };
  NovaContent.prototype.destroy = function (textId) { return this.wallet.socialOp('nova:text:destroy', { text_id: textId }, 0); };
  NovaContent.prototype.complain = function (textId, reason) {
    return this.wallet.socialOp('nova:text:complain', { text_id: textId, reason: reason || '' }, 0);
  };
  /* P-256 公钥导出（04 || X || Y，128 hex），用于密文内容购买 */
  async function generateP256PublicKey() {
    // WebCrypto 导出的 raw P-256 公钥即为 04||X||Y（65 字节 / 130 hex），与链上 buyer_pub 格式一致
    var subtleCrypto = requireSubtle();
    var kp = await subtleCrypto.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    var raw = new Uint8Array(await subtleCrypto.exportKey('raw', kp.publicKey));
    return bytesToHex(raw);
  }

  /* ================= NovaSubscription：按月 / 永久 / 分档 / 自动续费 ================= */
  function NovaSubscription(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  /* 创建 / 更新订阅档位：tiers = [{id, name, price, period:'monthly'|'lifetime', benefits}] */
  NovaSubscription.prototype.createCreator = function (tiers) {
    return this.wallet.moduleOp('sub', 'nova:sub:create', { tiers: tiers }, 0);
  };
  NovaSubscription.prototype.updateTiers = function (tiers) {
    return this.wallet.moduleOp('sub', 'nova:sub:update', { tiers: tiers }, 0);
  };
  /* 订阅：amount 为档位价格（NOVA） */
  NovaSubscription.prototype.subscribe = function (creator, tierId, opts) {
    var fields = { creator: creator, tier_id: tierId };
    if (opts && opts.autoRenew) fields.auto_renew = true;
    return this.wallet.moduleOp('sub', 'nova:sub:subscribe', fields, (opts && opts.amount) || 0);
  };
  /* 续费（节点/keeper 调用，余额不足自动取消） */
  NovaSubscription.prototype.renew = function (creator, user) {
    var fields = { creator: creator };
    if (user) fields.user = user;
    return this.wallet.moduleOp('sub', 'nova:sub:renew', fields, 0);
  };
  NovaSubscription.prototype.cancel = function (creator) {
    return this.wallet.moduleOp('sub', 'nova:sub:cancel', { creator: creator }, 0);
  };
  NovaSubscription.prototype.summary = function () { return this.rpc.get('/api/sub/summary'); };
  NovaSubscription.prototype.creator = function (addr) { return this.rpc.get('/api/sub/creator/' + addr); };
  NovaSubscription.prototype.status = function (user, creator) {
    return this.rpc.get('/api/sub/status/' + user + '/' + creator);
  };

  /* ================= NovaOracle：VRF 随机数 / 多源价格 / AI 验证 ================= */
  var ORACLE_STAKE = 500;
  function NovaOracle(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  /* 节点质押注册：pubkey 为 0x+128hex 的 ECVRF-P256 公钥，amount=500 NOVA */
  NovaOracle.prototype.registerNode = function (pubkey, amount) {
    return this.wallet.moduleOp('oracle', 'nova:oracle:node:register', { pubkey: pubkey }, amount || ORACLE_STAKE);
  };
  NovaOracle.prototype.exitNode = function () {
    return this.wallet.moduleOp('oracle', 'nova:oracle:node:exit', {}, 0);
  };
  NovaOracle.prototype.claimNode = function () {
    return this.wallet.moduleOp('oracle', 'nova:oracle:node:claim', {}, 0);
  };
  /* VRF 随机数请求（盲盒/抽奖/AI 验证），返回 request_id */
  NovaOracle.prototype.requestVrf = function (hint) {
    return this.wallet.moduleOp('oracle', 'nova:oracle:vrf:request', { hint: hint || '' }, 0);
  };
  /* 节点履行 VRF：proof = {gamma, c, s}（ECVRF-P256 证明），上链后任何人可验证 */
  NovaOracle.prototype.fulfillVrf = function (requestId, proof) {
    return this.wallet.moduleOp('oracle', 'nova:oracle:vrf:fulfill', { request_id: requestId, proof: proof }, 0);
  };
  NovaOracle.prototype.getVrfResult = function (requestId) {
    return this.rpc.get('/api/oracle/vrf/' + requestId);
  };
  /* 价格上报：feed 为 USDT/USD 或 ETH/USD，source 为 chainlink/pyth/binance/okx/gate */
  NovaOracle.prototype.updatePrice = function (feed, source, price) {
    return this.wallet.moduleOp('oracle', 'nova:oracle:price:update', { feed: feed, source: source, price: price }, 0);
  };
  /* 举报严重偏离（>25%）的节点价格，验证后罚没质押 */
  NovaOracle.prototype.report = function (target, feed) {
    return this.wallet.moduleOp('oracle', 'nova:oracle:report', { target: target, feed: feed }, 0);
  };
  /* AI 生成结果验证 */
  NovaOracle.prototype.submitAi = function (contentHash, meta) {
    return this.wallet.moduleOp('oracle', 'nova:oracle:ai:submit', { content_hash: contentHash, meta: meta || {} }, 0);
  };
  NovaOracle.prototype.verifyAi = function (contentHash, verdict) {
    return this.wallet.moduleOp('oracle', 'nova:oracle:ai:verify', { content_hash: contentHash, verdict: !!verdict }, 0);
  };
  NovaOracle.prototype.summary = function () { return this.rpc.get('/api/oracle/summary'); };
  NovaOracle.prototype.price = function (feed) { return this.rpc.get('/api/oracle/price/' + encodeURIComponent(feed)); };
  NovaOracle.prototype.nodes = function () { return this.rpc.get('/api/oracle/nodes'); };
  NovaOracle.prototype.aiStatus = function (contentHash) { return this.rpc.get('/api/oracle/ai/' + contentHash); };

  /* ================= NovaBridge：跨入 / 跨出 / 多签节点 ================= */
  var BRIDGE_STAKE = 1000;
  function NovaBridge(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  /* 跨入：外部链用户存入资产后，由桥节点监听到事件并登记（节点操作） */
  NovaBridge.prototype.deposit = function (asset, sourceChain, sourceTx, sourceAddr, amount, user) {
    var fields = { asset: asset, source_chain: sourceChain, source_tx: sourceTx, source_addr: sourceAddr, amount: amount };
    if (user) fields.user = user;
    return this.wallet.moduleOp('bridge', 'nova:bridge:deposit', fields, 0);
  };
  /* 跨出：NOVA 直接扣原生余额（amount=tx.amount）；包装资产销毁，amount 放 payload */
  NovaBridge.prototype.withdraw = function (asset, targetChain, targetAddr, amount) {
    var fields = { asset: asset, target_chain: String(targetChain).toLowerCase(), target_addr: targetAddr };
    var txAmount = 0;
    if (asset === 'NOVA') txAmount = amount;
    else fields.amount = amount;
    return this.wallet.moduleOp('bridge', 'nova:bridge:withdraw', fields, txAmount);
  };
  /* 节点操作：登记 / 签名 / 确认 */
  NovaBridge.prototype.registerNode = function (amount) {
    return this.wallet.moduleOp('bridge', 'nova:bridge:node:register', {}, amount || BRIDGE_STAKE);
  };
  NovaBridge.prototype.exitNode = function () {
    return this.wallet.moduleOp('bridge', 'nova:bridge:node:exit', {}, 0);
  };
  NovaBridge.prototype.claimNode = function () {
    return this.wallet.moduleOp('bridge', 'nova:bridge:node:claim', {}, 0);
  };
  NovaBridge.prototype.signDeposit = function (depositId) {
    return this.wallet.moduleOp('bridge', 'nova:bridge:deposit:sign', { deposit_id: depositId }, 0);
  };
  NovaBridge.prototype.claimDeposit = function (depositId) {
    return this.wallet.moduleOp('bridge', 'nova:bridge:deposit:claim', { deposit_id: depositId }, 0);
  };
  NovaBridge.prototype.signWithdraw = function (withdrawId) {
    return this.wallet.moduleOp('bridge', 'nova:bridge:withdraw:sign', { withdraw_id: withdrawId }, 0);
  };
  NovaBridge.prototype.confirmWithdraw = function (withdrawId, releaseTx) {
    var fields = { withdraw_id: withdrawId };
    if (releaseTx) fields.release_tx = releaseTx;
    return this.wallet.moduleOp('bridge', 'nova:bridge:withdraw:confirm', fields, 0);
  };
  NovaBridge.prototype.summary = function () { return this.rpc.get('/api/bridge/summary'); };
  NovaBridge.prototype.asset = function (symbol) { return this.rpc.get('/api/bridge/asset/' + symbol); };
  NovaBridge.prototype.deposits = function () { return this.rpc.get('/api/bridge/deposits'); };
  NovaBridge.prototype.withdrawals = function () { return this.rpc.get('/api/bridge/withdrawals'); };

  /* ================= NovaDex：AMM / LP / 挖矿 ================= */
  function NovaDex(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  NovaDex.prototype.createPair = function (pairId) {
    return this.wallet.moduleOp('dex', 'nova:dex:pair:create', { pair_id: pairId }, 0);
  };
  /* 添加流动性：amount0=NOVA（=tx.amount），amount1=包装资产（nUSDT/nETH） */
  NovaDex.prototype.addLiquidity = function (pairId, amount0, amount1) {
    return this.wallet.moduleOp('dex', 'nova:dex:add', { pair_id: pairId, amount0: amount0, amount1: amount1 }, amount0);
  };
  NovaDex.prototype.removeLiquidity = function (pairId, shares, min0, min1) {
    var fields = { pair_id: pairId, shares: shares };
    if (min0 != null) fields.min0 = min0;
    if (min1 != null) fields.min1 = min1;
    return this.wallet.moduleOp('dex', 'nova:dex:remove', fields, 0);
  };
  /* 兑换：token_in 0=NOVA 1=包装资产；min_out 滑点保护（默认期望值 95%） */
  NovaDex.prototype.swap = async function (pairId, amountIn, tokenIn, minOut) {
    var minOutVal = minOut;
    if (minOutVal == null) {
      var q = await this.quote(pairId, amountIn, tokenIn);
      if (q && q.amount_out != null) minOutVal = q.amount_out * 0.95;
    }
    return this.wallet.moduleOp('dex', 'nova:dex:swap',
      { pair_id: pairId, amount_in: amountIn, token_in: tokenIn, min_out: minOutVal || 0 },
      tokenIn === 0 ? amountIn : 0);
  };
  /* 流动性挖矿 */
  NovaDex.prototype.farmStake = function (pairId, shares) {
    return this.wallet.moduleOp('dex', 'nova:dex:farm:stake', { pair_id: pairId, shares: shares }, 0);
  };
  NovaDex.prototype.farmUnstake = function (pairId, shares) {
    return this.wallet.moduleOp('dex', 'nova:dex:farm:unstake', { pair_id: pairId, shares: shares }, 0);
  };
  NovaDex.prototype.farmClaim = function (pairId) {
    return this.wallet.moduleOp('dex', 'nova:dex:farm:claim', { pair_id: pairId }, 0);
  };
  NovaDex.prototype.quote = function (pairId, amountIn, tokenIn) {
    return this.rpc.get('/api/dex/quote?pair=' + encodeURIComponent(pairId) + '&amount_in=' + amountIn + '&token_in=' + (tokenIn || 0));
  };
  NovaDex.prototype.splitQuote = function (pairId, amountIn, tokenIn) {
    return this.rpc.get('/api/dex/split?pair=' + encodeURIComponent(pairId) + '&amount_in=' + amountIn + '&token_in=' + (tokenIn || 0));
  };
  NovaDex.prototype.summary = function () { return this.rpc.get('/api/dex/summary'); };
  NovaDex.prototype.lp = function (addr) { return this.rpc.get('/api/dex/lp/' + (addr || this.wallet.address)); };
  NovaDex.prototype.farm = function (pair, addr) {
    return this.rpc.get('/api/dex/farm/' + pair + '/' + (addr || this.wallet.address));
  };

  /* ================= NovaGovernance：提案 / 投票 / 委托 / 时间锁 ================= */
  function NovaGovernance(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  /* 发起提案：ptype 支持 param / fund / upgrade / arb */
  NovaGovernance.prototype.propose = function (opts) {
    var fields = { ptype: opts.ptype, title: opts.title };
    if (opts.description) fields.description = opts.description;
    if (opts.ptype === 'param') {
      fields.target = opts.target; fields.key = opts.key; fields.value = opts.value;
    } else if (opts.ptype === 'fund') {
      fields.recipient = opts.recipient; fields.amount = opts.amount;
    } else if (opts.ptype === 'upgrade') {
      fields.upgrade_height = opts.upgradeHeight; fields.content = opts.content;
    } else if (opts.ptype === 'arb') {
      fields.key = opts.key; fields.value = opts.value;
    } else {
      throw new Error('未知提案类型: ' + opts.ptype);
    }
    return this.wallet.moduleOp('gov', 'nova:gov:propose', fields, 0);
  };
  NovaGovernance.prototype.endorse = function (proposalId) {
    return this.wallet.moduleOp('gov', 'nova:gov:endorse', { proposal_id: proposalId }, 0);
  };
  NovaGovernance.prototype.vote = function (proposalId, support) {
    return this.wallet.moduleOp('gov', 'nova:gov:vote', { proposal_id: proposalId, support: !!support }, 0);
  };
  NovaGovernance.prototype.delegate = function (to) {
    return this.wallet.moduleOp('gov', 'nova:gov:delegate', { to: to }, 0);
  };
  NovaGovernance.prototype.confirm = function (proposalId) {
    return this.wallet.moduleOp('gov', 'nova:gov:confirm', { proposal_id: proposalId }, 0);
  };
  NovaGovernance.prototype.execute = function (proposalId) {
    return this.wallet.moduleOp('gov', 'nova:gov:execute', { proposal_id: proposalId }, 0);
  };
  NovaGovernance.prototype.cancel = function (proposalId) {
    return this.wallet.moduleOp('gov', 'nova:gov:cancel', { proposal_id: proposalId }, 0);
  };
  NovaGovernance.prototype.summary = function () { return this.rpc.get('/api/gov/summary'); };
  NovaGovernance.prototype.proposals = function (status) {
    return this.rpc.get('/api/gov/proposals' + (status ? '?status=' + status : ''));
  };
  NovaGovernance.prototype.proposal = function (pid) { return this.rpc.get('/api/gov/proposals/' + pid); };
  NovaGovernance.prototype.power = function (addr) {
    return this.rpc.get('/api/gov/power/' + (addr || this.wallet.address));
  };

  /* ================= NovaDID：身份绑定 / 认证 / 声誉 ================= */
  function NovaDID(wallet, opts) {
    this.wallet = wallet;
    this.rpc = (opts && opts.rpc) || wallet.rpc;
  }
  /* 绑定：kind = email|telegram|x|avatar，hash 为 SHA3-512 哈希（avatar 可为 CID） */
  NovaDID.prototype.bind = function (kind, hash, visible) {
    var cleanHash = String(hash || '').replace(/^0x/, '');
    return this.wallet.moduleOp('did', 'nova:did:bind', { kind: kind, hash: cleanHash, visible: visible !== false }, 0);
  };
  NovaDID.prototype.unbind = function (kind) {
    return this.wallet.moduleOp('did', 'nova:did:unbind', { kind: kind }, 0);
  };
  /* 创作者认证申请：portfolio 为链上作品合约地址列表 */
  NovaDID.prototype.apply = function (portfolio, statement) {
    var fields = { portfolio: portfolio };
    if (statement) fields.statement = statement;
    return this.wallet.moduleOp('did', 'nova:did:apply', fields, 0);
  };
  NovaDID.prototype.vote = function (applicant, support) {
    return this.wallet.moduleOp('did', 'nova:did:vote', { applicant: applicant, support: !!support }, 0);
  };
  NovaDID.prototype.profile = function (addr, viewer) {
    return this.rpc.get('/api/did/' + (addr || this.wallet.address) + (viewer ? '?viewer=' + viewer : ''));
  };
  NovaDID.prototype.reputation = function (addr, viewer) {
    return this.rpc.get('/api/did/reputation/' + (addr || this.wallet.address) + (viewer ? '?viewer=' + viewer : ''));
  };
  NovaDID.prototype.summary = function () { return this.rpc.get('/api/did/summary'); };

  /* ================= NovaChain：区块 / 交易 / 搜索 / 统计 ================= */
  function NovaChain(rpcOrUrl, opts) {
    this.rpc = rpcOrUrl instanceof RpcClient ? rpcOrUrl : new RpcClient(rpcOrUrl);
    opts = opts || {};
    this.nodeUrl = this.rpc.nodeUrl;
  }
  NovaChain.prototype.block = function (height) { return this.rpc.get('/api/chain/block/' + height); };
  NovaChain.prototype.search = function (q) { return this.rpc.get('/api/chain/search?q=' + encodeURIComponent(q)); };
  NovaChain.prototype.stats = function () { return this.rpc.get('/api/chain/stats'); };
  NovaChain.prototype.sync = function (afterHeight) {
    return this.rpc.get('/api/chain/sync' + (afterHeight ? '?after_height=' + afterHeight : ''));
  };
  NovaChain.prototype.tx = function (txid) { return this.rpc.get('/api/tx/' + txid); };

  /* ================= NovaEvents：交易确认 / 合约事件 / 区块更新监听 ================= */
  function NovaEvents(opts) {
    opts = opts || {};
    this.rpc = opts.rpc instanceof RpcClient ? opts.rpc : new RpcClient(opts.nodeUrl);
    this.intervalMs = opts.intervalMs || 3000;
    this._timer = null;
    this._height = opts.height != null ? opts.height : 0;
    this._seenTx = {};
    this._seenContract = {};
    this._handlers = { tx: [], block: [], contract: [], stats: [] };
    var self = this;
    if (opts.onTx) this.onTx(opts.onTx);
    if (opts.onBlock) this.onBlock(opts.onBlock);
    if (opts.onContractEvent) this.onContractEvent(opts.onContractEvent);
    if (opts.onStats) this.onStats(opts.onStats);
  }
  NovaEvents.prototype.onTx = function (fn) { if (typeof fn === 'function') this._handlers.tx.push(fn); return this; };
  NovaEvents.prototype.onBlock = function (fn) { if (typeof fn === 'function') this._handlers.block.push(fn); return this; };
  NovaEvents.prototype.onContractEvent = function (fn) { if (typeof fn === 'function') this._handlers.contract.push(fn); return this; };
  NovaEvents.prototype.onStats = function (fn) { if (typeof fn === 'function') this._handlers.stats.push(fn); return this; };
  NovaEvents.prototype._emit = function (kind, payload) {
    this._handlers[kind].slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { /* 用户回调异常不阻塞监听 */ }
    });
  };
  NovaEvents.prototype._poll = async function () {
    var d = await this.rpc.get('/api/chain/sync?after_height=' + this._height);
    var self = this;
    (d.blocks || []).forEach(function (b) {
      self._height = Math.max(self._height, b.height || 0);
      self._emit('block', b);
    });
    (d.txs || []).forEach(function (t) {
      if (self._seenTx[t.txid]) return;
      self._seenTx[t.txid] = true;
      self._emit('tx', t);
      if (t.receiver && String(t.receiver).indexOf('0x') === 0) {
        self._emit('contract', { txid: t.txid, contract: t.receiver, tx: t });
      }
    });
    (d.contracts || []).forEach(function (c) {
      if (self._seenContract[c.address]) return;
      self._seenContract[c.address] = true;
      self._emit('contract', { address: c.address, creator: c.creator, kind: 'deploy' });
    });
    if (d.stats) self._emit('stats', d.stats);
    return d;
  };
  NovaEvents.prototype.start = function () {
    var self = this;
    if (this._timer) return this;
    this._timer = setInterval(function () {
      self._poll().catch(function () { /* 网络抖动忽略，下一轮重试 */ });
    }, this.intervalMs);
    this._poll().catch(function () {});
    return this;
  };
  NovaEvents.prototype.stop = function () {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    return this;
  };

  /* ================= NovaFaucet：测试网水龙头（免费测试 NOVA） ================= */
  /* 测试网专用：POST /api/faucet/request 无需签名，节点侧按地址 24h / IP 每日 / 全局日限额限频。 */
  function NovaFaucet(rpcOrUrl, opts) {
    opts = opts || {};
    if (rpcOrUrl instanceof RpcClient) { this.rpc = rpcOrUrl; }
    else if (rpcOrUrl && rpcOrUrl.rpc) { this.rpc = rpcOrUrl.rpc; }
    else {
      var url = (rpcOrUrl && typeof rpcOrUrl === 'object' && rpcOrUrl.nodeUrl) ? rpcOrUrl.nodeUrl : rpcOrUrl;
      this.rpc = new RpcClient(url || opts.nodeUrl);
    }
  }
  NovaFaucet.prototype.status = function () { return this.rpc.get('/api/faucet/status'); };
  NovaFaucet.prototype.request = async function (addr, fingerprint) {
    if (!addr || typeof addr !== 'string') throw new Error('缺少目标地址');
    var body = { addr: addr };
    if (fingerprint) body.fingerprint = fingerprint;
    var res = await this.rpc.post('/api/faucet/request', body);
    if (res && res.error) throw new Error(res.error);
    return res;
  };

  /* ================= 导出 ================= */
  return {
    VERSION: VERSION,
    NOVA_DERIVATION_PATH: NOVA_DERIVATION_PATH,
    ERR: {
      NOT_CONNECTED: 4100,
      INVALID_ARG: 4001,
      RPC_ERROR: -1
    },
    utils: {
      bytesToHex: bytesToHex,
      hexToBytes: hexToBytes,
      sha3_512Hex: sha3_512Hex,
      sha256: sha256,
      sha512: sha512,
      canonicalAmount: canonicalAmount,
      deriveAddress: deriveAddress,
      randomBytes: randomBytes,
      generateMnemonic: generateMnemonic,
      validateMnemonic: validateMnemonic,
      entropyToMnemonic: entropyToMnemonic,
      mnemonicToEntropy: mnemonicToEntropy,
      mnemonicToSeed: mnemonicToSeed,
      deriveNovaKey: deriveNovaKey,
      deriveEd25519FromPath: deriveEd25519FromPath,
      ed25519PublicKey: ed25519PublicKey,
      ed25519Sign: ed25519Sign,
      ed25519Verify: ed25519Verify,
      deployAddress: deployAddress
    },
    RpcClient: RpcClient,
    NovaWallet: NovaWallet,
    NovaContract: NovaContract,
    NovaContent: NovaContent,
    NovaStaking: NovaStaking,
    NovaSubscription: NovaSubscription,
    NovaOracle: NovaOracle,
    NovaBridge: NovaBridge,
    NovaDex: NovaDex,
    NovaGovernance: NovaGovernance,
    NovaDID: NovaDID,
    NovaChain: NovaChain,
    NovaEvents: NovaEvents,
    NovaFaucet: NovaFaucet
  };
});
