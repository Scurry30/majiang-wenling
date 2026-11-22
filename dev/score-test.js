/*
 *  算分自检。用法: node dev/score-test.js
 */
"use strict";

const Wenling = require('../lib');
const S = require('../lib/score');

const rule = Wenling.rule();

const kezi   = (tile, o = {}) => ({ kind: 'kezi',   tile, fulou: !!o.fulou, n_joker: o.n_joker || 0 });
const gang   = (tile, o = {}) => ({ kind: 'gang',   tile, angang: !!o.angang, n_joker: o.n_joker || 0 });
const shunzi = (tile)         => ({ kind: 'shunzi', tile });
const pair   = (tile, nj = 0) => ({ tile, n_joker: nj });

let fail = 0;
function eq(name, got, want) {
    const ok = got === want;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${got}${ok ? '' : `（期望 ${want}）`}`);
    if (!ok) fail++;
}

console.log('--- 胡头表 ---');
eq('明刻软', S.mianzi_hutou(kezi('m5', { fulou: true }), rule), 2);
eq('明刻硬', S.mianzi_hutou(kezi('m1', { fulou: true }), rule), 4);
eq('暗刻软', S.mianzi_hutou(kezi('m5'), rule), 4);
eq('暗刻硬', S.mianzi_hutou(kezi('z1'), rule), 8);
eq('明杠软', S.mianzi_hutou(gang('m5', { fulou: true }), rule), 8);
eq('明杠硬', S.mianzi_hutou(gang('m1', { fulou: true }), rule), 16);
eq('暗杠软', S.mianzi_hutou(gang('m5', { angang: true }), rule), 16);
eq('暗杠硬', S.mianzi_hutou(gang('z1', { angang: true }), rule), 32);
eq('财神拼凑的刻子不计', S.mianzi_hutou(kezi('m5', { n_joker: 1 }), rule), 0);
eq('将牌硬张', S.pair_hutou(pair('z1'), rule), 2);
eq('将牌软张', S.pair_hutou(pair('m5'), rule), 0);

console.log('\n--- 台数与分数 ---');
const pinghu = {
    mianzi: [shunzi('m1'), shunzi('m4'), shunzi('p1'), shunzi('s1'), shunzi('s4')],
    pair: pair('m5'), flowers: [], jokers: 0, seat: 0, zimo: false, rule,
};
let r = S.score(pinghu);
eq('平胡总台数', r.tai, 2);           // 平胡 1 + 硬胡 1
eq('平胡胡头', r.hutou, 20);          // 底胡 20，无面子胡头
eq('平胡分数', r.defen, 80);          // 20 × 2²

const duidui = {
    mianzi: [kezi('m1', { fulou: true }), kezi('p1', { fulou: true }),
             kezi('s1', { fulou: true }), kezi('m5')],
    pair: pair('p5'), flowers: [], jokers: 0, seat: 0, zimo: false, rule,
};
r = S.score(duidui);
eq('对对胡台数', r.tai, 3);           // 对对 2 + 硬胡 1
eq('对对胡胡头', r.hutou, 36);        // 明刻硬 4×3 + 暗刻软 4 + 底胡 20
eq('对对胡分数', r.defen, 36 * 8);

const qingyise = {
    mianzi: [shunzi('m1'), shunzi('m4'), shunzi('m7'), shunzi('m2'), shunzi('m5')],
    pair: pair('m9'), flowers: [], jokers: 0, seat: 0, zimo: true, rule,
};
r = S.score(qingyise);
eq('清一色台数', r.tai, 6);           // 清一色 4 + 平胡 1 + 硬胡 1
eq('清一色胡头（将 m9 硬张 2 + 底胡 20 + 自摸 4）', r.hutou, 26);

const hunyise = {
    mianzi: [shunzi('m1'), shunzi('m4'), kezi('z1', { fulou: true }), shunzi('m2'), shunzi('m5')],
    pair: pair('m9'), flowers: [], jokers: 0, seat: 2, zimo: false, rule,
};
r = S.score(hunyise);
eq('混一色台数', r.tai, 3);           // 混一色 2 + 硬胡 1（门风是西，z1 东不是门风）

console.log('\n--- 闹闹 ---');
const naonao = {
    mianzi: [shunzi('m1'), shunzi('m4'), shunzi('p1'), kezi('z6'), kezi('z7')],
    pair: pair('m9'), flowers: [], jokers: 0, seat: 0, zimo: false,
    nao: true, joker: 'z5', rule,
};
r = S.score(naonao);
console.log('   台数明细:', r.tai_list.map(t => `${t.name}${t.tai}`).join(' '));
eq('闹闹台数', r.tai, 3);             // 闹闹 2（发刻 + 中刻）+ 硬胡 1

console.log('\n--- 腊子 ---');
r = S.score({ ...pinghu, jokers: 3 });
eq('三得腊子封顶', r.defen, 500);
eq('三得腊子标记', r.lazi.includes('三得腊子'), true);

r = S.score({ ...pinghu, flowers: ['f5', 'f6', 'f7', 'f8'] });
eq('四红花封顶', r.defen, 500);

r = S.score({ ...pinghu, flowers: ['f1', 'f2', 'f3', 'f4'] });
eq('四黑花封顶', r.defen, 500);

const sifeng = {
    mianzi: [kezi('z1'), kezi('z2'), kezi('z3'), kezi('z4'), shunzi('m1')],
    pair: pair('m9'), flowers: [], jokers: 0, seat: 0, zimo: false, rule,
};
r = S.score(sifeng);
eq('四风齐封顶', r.defen, 500);

console.log('\n--- 结算 ---');
const players = [
    { seat: 0, is_winner: true,  base: 18, defen: 224 },
    { seat: 1, is_winner: false, base: 10 },
    { seat: 2, is_winner: false, base: 6  },
    { seat: 3, is_winner: false, base: 4  },
];
let d = S.settle(players);
console.log('   收支:', d.join(', '));
eq('胡家收入（三家各付 224）', d[0], 672);
eq('结算零和', d.reduce((a, b) => a + b, 0), 0);

const huangpai = [
    { seat: 0, is_winner: false, base: 10 },
    { seat: 1, is_winner: false, base: 6  },
    { seat: 2, is_winner: false, base: 4  },
    { seat: 3, is_winner: false, base: 4  },
];
d = S.settle(huangpai);
console.log('   流局收支:', d.join(', '));
eq('流局零和', d.reduce((a, b) => a + b, 0), 0);

console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exitCode = fail ? 1 : 0;
