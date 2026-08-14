/* Nova 钱包加密内核（纯 JS，零外部依赖，浏览器/Node 通用）
 *
 * 提供：
 *  - BIP39 助记词（生成 / 校验 / 转种子）
 *  - SLIP-0010 Ed25519 派生（BIP44 路径 m/44'/223'/0'/0/0 派生 Nova 私钥）
 *  - AES-256-GCM 加密保险库（PBKDF2-SHA256 密码 KDF）
 *  - WebAuthn PRF 扩展生物识别解锁（浏览器支持时可用）
 */
(function (global) {
    'use strict';

    var TE = new TextEncoder();
    var TD = new TextDecoder();

    // ============================================================
    // 基础工具
    // ============================================================
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
        var out = new Uint8Array(n);
        if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(out);
        else throw new Error('无安全随机源');
        return out;
    }
    function toArrayBuffer(bytes) {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function bytesToBase64(bytes) {
        var s = '', i;
        for (i = 0; i < bytes.length; i += 3) {
            var b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
            s += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)] +
                 (i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=') +
                 (i + 2 < bytes.length ? B64[b2 & 63] : '=');
        }
        return s;
    }
    function base64ToBytes(s) {
        s = String(s || '').replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
        var out = new Uint8Array(Math.floor(s.length * 3 / 4)), p = 0, buf = 0, bits = 0;
        for (var i = 0; i < s.length; i++) {
            var v = B64.indexOf(s[i]);
            if (v < 0) continue;
            buf = (buf << 6) | v; bits += 6;
            if (bits >= 8) { bits -= 8; out[p++] = (buf >> bits) & 0xff; }
        }
        return out;
    }
    function bytesToBase64url(bytes) {
        return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function base64urlToBytes(s) { return base64ToBytes(String(s || '').replace(/-/g, '+').replace(/_/g, '/')); }

    // ============================================================
    // WebCrypto 封装
    // ============================================================
    function subtle() { return global.crypto && global.crypto.subtle; }
    function requireSubtle() { if (!subtle()) throw new Error('当前环境不支持 WebCrypto（需 HTTPS 或 localhost）'); return subtle(); }
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
    async function hkdfSha256(ikm, salt, info, len) {
        var key = await requireSubtle().importKey('raw', toArrayBuffer(ikm), 'HKDF', false, ['deriveBits']);
        var bits = await requireSubtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(info) }, key, len * 8);
        return new Uint8Array(bits);
    }
    async function aesGcmEncrypt(keyBytes, plainBytes) {
        var key = await requireSubtle().importKey('raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['encrypt']);
        var iv = randomBytes(12);
        var ct = new Uint8Array(await requireSubtle().encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(plainBytes)));
        return { iv: iv, ct: ct };
    }
    async function aesGcmDecrypt(keyBytes, ivBytes, ctBytes) {
        var key = await requireSubtle().importKey('raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['decrypt']);
        var pt = await requireSubtle().decrypt({ name: 'AES-GCM', iv: toArrayBuffer(ivBytes) }, key, toArrayBuffer(ctBytes));
        return new Uint8Array(pt);
    }

    // ============================================================
    // BIP39（英文词表在构建时注入，共 2048 词）
    // ============================================================
    var BIP39_ENGLISH = "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence evil evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee feed feel female fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose improve impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean measure meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning mosquito mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive name napkin narrow nasty nation nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north nose notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain obvious occur ocean october odor off offer office often oil okay old olive olympic omit once one onion online only open opera opinion oppose option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver similar simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort soul sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike spin spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stool story stove strategy street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo";
    var WORDS = BIP39_ENGLISH.trim().split(/\s+/);

    function ensureWordlist() {
        if (WORDS.length !== 2048) throw new Error('BIP39 词表未初始化（长度 ' + WORDS.length + '）');
    }
    async function entropyToMnemonic(entropyBytes) {
        ensureWordlist();
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
        var ent = randomBytes(strength / 8);
        return entropyToMnemonic(ent);
    }
    async function mnemonicToEntropy(mnemonic) {
        ensureWordlist();
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
        return pbkdf2(TE.encode(words.join(' ')), TE.encode(salt), 2048, 'SHA-512', 64);
    }
    async function validateMnemonic(mnemonic) {
        try { await mnemonicToEntropy(mnemonic); return true; } catch (e) { return false; }
    }

    // ============================================================
    // SLIP-0010（Ed25519，仅硬化派生）
    // ============================================================
    var HARDENED = 0x80000000;
    function ser32(n) {
        var o = new Uint8Array(4);
        o[0] = (n >>> 24) & 0xff; o[1] = (n >>> 16) & 0xff; o[2] = (n >>> 8) & 0xff; o[3] = n & 0xff;
        return o;
    }
    async function slip10Master(seed) {
        var I = await hmacSha512(TE.encode('ed25519 seed'), seed);
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

    // ============================================================
    // 加密保险库
    // ============================================================
    var VAULT_VERSION = 2;
    var PASSWORD_ITERATIONS = 210000; // PBKDF2-HMAC-SHA256 迭代次数（OWASP 推荐量级）

    async function derivePasswordKey(password, salt, iterations) {
        return pbkdf2(TE.encode(password), salt, iterations || PASSWORD_ITERATIONS, 'SHA-256', 32);
    }
    async function wrapWithPassword(masterKey, password, iterations) {
        var salt = randomBytes(16);
        var iters = iterations || PASSWORD_ITERATIONS;
        var kek = await derivePasswordKey(password, salt, iters);
        var box = await aesGcmEncrypt(kek, masterKey);
        return { salt: bytesToBase64(salt), iterations: iters, iv: bytesToBase64(box.iv), ct: bytesToBase64(box.ct) };
    }
    async function unwrapWithPassword(wrap, password) {
        var kek = await derivePasswordKey(password, base64ToBytes(wrap.salt), wrap.iterations);
        return aesGcmDecrypt(kek, base64ToBytes(wrap.iv), base64ToBytes(wrap.ct));
    }
    async function encryptWithMaster(masterKey, plainText) {
        var box = await aesGcmEncrypt(masterKey, TE.encode(plainText));
        return { iv: bytesToBase64(box.iv), ct: bytesToBase64(box.ct) };
    }
    async function decryptWithMaster(masterKey, wrap) {
        var pt = await aesGcmDecrypt(masterKey, base64ToBytes(wrap.iv), base64ToBytes(wrap.ct));
        return TD.decode(pt);
    }

    // ============================================================
    // WebAuthn PRF（生物识别解锁，需要浏览器支持）
    // ============================================================
    function webauthnSupported() {
        return !!(global.isSecureContext && global.PublicKeyCredential &&
            global.navigator && navigator.credentials && navigator.credentials.create &&
            navigator.credentials.get);
    }
    function webauthnPrfSupported() {
        if (!webauthnSupported()) return false;
        try {
            return typeof global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';
        } catch (e) { return false; }
    }
    async function webauthnRegister(rpName, userName, userDisplay) {
        if (!webauthnSupported()) throw new Error('当前环境不支持 WebAuthn（需 HTTPS 或 localhost）');
        var prfSalt = randomBytes(32);
        var challenge = randomBytes(32);
        var user = {
            id: toArrayBuffer(randomBytes(16)),
            name: userName || 'nova-wallet',
            displayName: userDisplay || 'Nova Wallet'
        };
        var cred = await navigator.credentials.create({
            publicKey: {
                rp: { name: rpName || 'Nova Wallet', id: global.location && global.location.hostname },
                user: user,
                challenge: toArrayBuffer(challenge),
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
                extensions: { prf: { eval: { first: toArrayBuffer(prfSalt) } } },
                timeout: 60000
            }
        });
        var ext = cred.getClientExtensionResults().prf;
        if (!ext || !ext.results || !ext.results.length) throw new Error('设备/浏览器不支持 PRF 扩展，无法启用生物识别');
        var prfOutput = new Uint8Array(ext.results[0]);
        var deviceKey = await hkdfSha256(prfOutput, TE.encode('nova-webauthn-salt'), TE.encode('nova-device-key'), 32);
        return {
            credId: bytesToBase64url(new Uint8Array(cred.rawId)),
            prfSalt: bytesToBase64(prfSalt),
            deviceKey: deviceKey
        };
    }
    async function webauthnUnlock(credIdB64url, prfSaltB64) {
        if (!webauthnSupported()) throw new Error('当前环境不支持 WebAuthn');
        var challenge = randomBytes(32);
        var cred = await navigator.credentials.get({
            publicKey: {
                challenge: toArrayBuffer(challenge),
                allowCredentials: [{ type: 'public-key', id: toArrayBuffer(base64urlToBytes(credIdB64url)) }],
                userVerification: 'preferred',
                extensions: { prf: { eval: { first: toArrayBuffer(base64ToBytes(prfSaltB64)) } } },
                timeout: 60000
            }
        });
        var ext = cred.getClientExtensionResults().prf;
        if (!ext || !ext.results || !ext.results.length) throw new Error('未取得生物识别密钥');
        var prfOutput = new Uint8Array(ext.results[0]);
        return hkdfSha256(prfOutput, TE.encode('nova-webauthn-salt'), TE.encode('nova-device-key'), 32);
    }

  function wipeBytes() {
    for (var i = 0; i < arguments.length; i++) {
      var b = arguments[i];
      if (b && b.byteLength) { try { b.fill(0); } catch (e) {} }
    }
  }
    global.NovaCrypto = {
        VAULT_VERSION: VAULT_VERSION,
        PASSWORD_ITERATIONS: PASSWORD_ITERATIONS,
        NOVA_DERIVATION_PATH: NOVA_DERIVATION_PATH,
        wordCount: WORDS.length,
        bytesToHex: bytesToHex,
        hexToBytes: hexToBytes,
        randomBytes: randomBytes,
        bytesToBase64: bytesToBase64,
        base64ToBytes: base64ToBytes,
        bytesToBase64url: bytesToBase64url,
        base64urlToBytes: base64urlToBytes,
        sha256: sha256,
        sha512: sha512,
        hkdfSha256: hkdfSha256,
        pbkdf2: pbkdf2,
        aesGcmEncrypt: aesGcmEncrypt,
        aesGcmDecrypt: aesGcmDecrypt,
        entropyToMnemonic: entropyToMnemonic,
        generateMnemonic: generateMnemonic,
        mnemonicToEntropy: mnemonicToEntropy,
        mnemonicToSeed: mnemonicToSeed,
        validateMnemonic: validateMnemonic,
        deriveEd25519FromPath: deriveEd25519FromPath,
        deriveNovaKey: deriveNovaKey,
        derivePasswordKey: derivePasswordKey,
        wrapWithPassword: wrapWithPassword,
        unwrapWithPassword: unwrapWithPassword,
        encryptWithMaster: encryptWithMaster,
        decryptWithMaster: decryptWithMaster,
        webauthnSupported: webauthnSupported,
        webauthnPrfSupported: webauthnPrfSupported,
        webauthnRegister: webauthnRegister,
        webauthnUnlock: webauthnUnlock,
        wipeBytes: wipeBytes
    };
})(typeof window !== 'undefined' ? window : globalThis);


