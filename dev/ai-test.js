/*
 *  AI 自检 + AI vs 随机 对抗测试。
 *    node dev/ai-test.js [局数]
 */
"use strict";

const Wenling = require('../lib');
const Game    = require('../lib/game');
const Shoupai = require('../lib/shoupai');
const AI      = require('../lib/ai');
const { shanten, ukeire } = require('../lib/shanten');

const rule = Wenling.rule();

function parse(s) {
    const rv = [];
    let suit = null;
    for (const ch of s.replace(/[\s,]/g, '')) {
        if ('mpsz'.includes(ch)) suit = ch;
        else rv.push(suit + ch);
    }
    return rv;
}

let fail = 0;
function eq(name, got, want) {
    const ok = got === want;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${got}${ok ? '' : `（期望 ${want}）`}`);
    if (!ok) fail++;
}

const J = 'f1';   // 不可能出现的财神种，等价于「没有财神」

function hand(str) { return Shoupai.from(parse(str), rule, J) }

/* ---------- 1. 向听数 ---------- */
console.log('--- 向听数 ---');

/* 16 张：5 面子 + 单张 = 听牌 */
const tenpai = hand('m123 m456 m789 p123 p456 z1');
eq('5 面子 + 单张（听 z1）', shanten(tenpai), 0);
eq('听 z1 的有效牌', ukeire(tenpai), 3);

/* 4 面子 + 将 + 搭子 = 听牌 */
eq('4 面子 + 将 + 搭子', shanten(hand('m123 m456 m789 p123 z11 s24')), 0);

/* 少一组面子 */
eq('4 面子 + 将 + 两张孤张', shanten(hand('m123 m456 m789 p123 z11 s2 s5')), 1);

/* 财神补一张 */
const jokerHand = Shoupai.from(parse('m123 m456 m789 p123 p456 z1'), rule, 'z1');
/* 把 z1 当财神：手里其实是 15 张实体 + 1 财神，等同听牌 */
eq('财神顶将牌', shanten(jokerHand), 0);

/* ---------- 2. AI 打牌 ---------- */
console.log('\n--- AI 打牌 ---');
{
    /* 明显该打的牌：孤张字牌 z7 / z1，而不是拆 m123。
       两个孤张字牌等价，打哪张都行，关键是别拆面子。 */
    const h = hand('m123 m456 m789 p123 p456 z1 z7');
    const t = AI.select_dapai(h);
    eq('优先打孤张字牌', ['z1', 'z7'].includes(t), true);
}

/* ---------- 3. 速度 ---------- */
console.log('\n--- 速度 ---');
{
    const h = Shoupai.from(
        ['m1','m2','m3','m4','m5','p1','p2','p3','p4','s1','s2','s3','z1','z2','z5','z7'],
        rule, 'f1');
    const t0 = Date.now();
    for (let i = 0; i < 50; i++) AI.select_dapai(h);
    const ms = (Date.now() - t0) / 50;
    console.log(`  每次打牌决策 ${ms.toFixed(1)} ms`);
    if (ms > 200) { console.log('✗ 太慢'); fail++ }
}

/* ---------- 4. AI vs 随机 对抗 ---------- */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function random_policy(seed) {
    const rnd = mulberry32(seed);
    return {
        dapai(hand) { const l = hand.dapai_list; return l[Math.floor(rnd() * l.length)] },
        hu_zimo()   { return true },
        hu_rong()   { return true },
        pon()       { return rnd() < 0.3 },
        gang()      { return rnd() < 0.3 },
        chi(hand, options) { return rnd() < 0.25 ? options[0] : null },
        self_gang() { return null },
    };
}

(async () => {
    const N = process.argv[2] ? +process.argv[2] : 30;
    console.log(`\n--- 全 AI 桌 vs 全随机桌（各 ${N} 局） ---`);

    async function run_table(policy_factory, seed) {
        const game = new Game(rule, policy_factory(seed), { seed: seed * 7919 });
        game.kaiju();
        const r = await game.run();
        let chi = 0, pon = 0;
        for (const rec of game.log) {
            if (rec.action === '吃') chi++;
            if (rec.action === '碰') pon++;
        }
        return { r, chi, pon };
    }

    const ai_factory = () => {
        const ai = AI.create_policy();
        return {
            dapai: (h, c) => ai.dapai(h, c), hu_zimo: () => true, hu_rong: () => true,
            pon:   (h, t) => ai.pon(h, t),   gang:    () => false,
            chi:   (h, o) => ai.chi(h, o),   self_gang: () => null,
        };
    };

    let aiWin = 0, rndWin = 0, aiChi = 0, aiPon = 0;
    for (let seed = 1; seed <= N; seed++) {
        const a = await run_table(ai_factory, seed);
        if (a.r.type === 'hule') aiWin++;
        aiChi += a.chi; aiPon += a.pon;

        const b = await run_table(seed => random_policy(seed), seed);
        if (b.r.type === 'hule') rndWin++;
    }

    console.log(`  AI 桌   : 和牌 ${aiWin}/${N}  吃 ${aiChi} 碰 ${aiPon}`);
    console.log(`  随机桌  : 和牌 ${rndWin}/${N}`);

    const ok = aiWin > rndWin;
    console.log(`${ok ? '✓' : '✗'} AI 桌和牌数显著高于随机桌`);
    if (!ok) fail++;

    /* ---------- 5. A/B：有效牌是否扣除已见牌 ---------- */
    const M = 80;
    console.log(`\n--- A/B：扣已见牌（P0,P2） vs 不扣（P1,P3），${M} 局 ---`);
    {
        let seenScore = 0, seenWin = 0, baseScore = 0, baseWin = 0;

        for (let seed = 1; seed <= M; seed++) {
            const withSeen = AI.create_policy();               // 扣已见牌
            const noSeen   = AI.create_policy({ seen: false }); // 旧行为
            const pick = c => (c.player === 0 || c.player === 2) ? withSeen : noSeen;

            const policy = {
                dapai:  (h, c) => pick(c).dapai(h, c),
                hu_zimo: () => true,
                hu_rong: () => true,
                pon:    (h, t, c) => pick(c).pon(h, t),
                gang:   () => false,
                chi:    (h, o, c) => pick(c).chi(h, o),
                self_gang: () => null,
            };

            const g = new Game(rule, policy, { seed: seed * 7919 });
            g.kaiju();
            const r = await g.run();

            for (let i = 0; i < 4; i++) {
                const isSeen = (i === 0 || i === 2);
                if (isSeen) { seenScore += r.delta[i]; if (r.type === 'hule' && r.winner === i) seenWin++ }
                else        { baseScore += r.delta[i]; if (r.type === 'hule' && r.winner === i) baseWin++ }
            }
        }

        console.log(`  扣已见牌 : 和牌 ${seenWin}  均分 ${(seenScore / (2 * M)).toFixed(1)}`);
        console.log(`  不扣     : 和牌 ${baseWin}  均分 ${(baseScore / (2 * M)).toFixed(1)}`);

        const better = seenWin >= baseWin;
        console.log(`${better ? '✓' : '✗'} 扣除已见牌后不弱于旧版`);
        if (!better) fail++;
    }

    console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
    process.exitCode = fail ? 1 : 0;
})();
