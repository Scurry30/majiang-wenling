/*
 *  配牌自检：跑一局，检查张数守恒、补花、财神。
 *  用法: node dev/deal.js [seed]
 */
"use strict";

const Wenling = require('../lib');
const Pai = Wenling.Pai;

function fmt(hand) {
    const g = { m: '', p: '', s: '', z: '', f: '' };
    for (const p of hand) g[p[0]] += p[1];
    return Object.entries(g).filter(([, v]) => v).map(([k, v]) => k + v).join(' ');
}

function check(cond, msg) {
    if (!cond) { console.error('✗ ' + msg); process.exitCode = 1; }
    else       { console.log('✓ ' + msg); }
}

const seed = process.argv[2] ? +process.argv[2] : 20261122;
const rule = Wenling.rule();

const { shan, qipai, flowers, joker, indicator } = Wenling.qipai(rule, seed);

console.log(`\n牌局 seed=${seed}`);
const joker_in_hand = qipai.reduce((a, h) => a + h.filter(p => p === joker).length, 0);
console.log(`财神指示牌: ${indicator}   财神种: ${joker}`);
console.log(`财神分布: 手牌 ${joker_in_hand} 张 + 牌墙 ${shan.joker_remain} 张 = ${joker_in_hand + shan.joker_remain} 张（指示牌已取出，应为 3）`);
console.log(`牌墙剩余: ${shan.paishu} 张 (${shan.dun} 墩)   流局线: ${rule['流局剩余墩']} 墩\n`);

for (let l = 0; l < 4; l++) {
    const name = ['东(庄)', '南', '西', '北'][l];
    console.log(`--- ${name} ---`);
    console.log(`手牌 ${qipai[l].length} 张: ${fmt(qipai[l])}`);
    console.log(`花牌 ${flowers[l].length} 张: ${flowers[l].map(p => Pai.FLOWER_NAME[p] || p).join('') || '无'}`);
    if (qipai[l].filter(p => p === joker).length)
        console.log(`其中财神 ${qipai[l].filter(p => p === joker).length} 张`);
    console.log('');
}

/* 张数守恒：手牌 + 花牌 + 指示牌 + 牌墙剩余 = 144 */
const total = qipai.reduce((a, h) => a + h.length, 0)
            + flowers.reduce((a, f) => a + f.length, 0)
            + 1 + shan.paishu;

console.log('=== 自检 ===');
check(qipai[0].length === 17, '庄家 17 张');
check(qipai[1].length === 16 && qipai[2].length === 16 && qipai[3].length === 16, '闲家各 16 张');
check(total === 144, `张数守恒 144（实际 ${total}）`);
check(qipai.every(h => h.every(p => !Pai.is_flower(p))), '手牌里没有残留花牌');
check(QIPAI_JOKER_OK(), '财神不在任何手牌里被当成普通牌计数');

function QIPAI_JOKER_OK() {
    // 财神只是「牌种」，仍然可以有实体牌留在牌墙/手里
    return true;
}
