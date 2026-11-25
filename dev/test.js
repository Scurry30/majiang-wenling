/*
 *  不变量测试：跑 N 个 seed 的配牌，检查张数守恒 / 手牌张数 / 财神张数 / 补花。
 *  用法: node dev/test.js [N]
 */
"use strict";

const Wenling = require('../lib');
const Pai = Wenling.Pai;

const N = process.argv[2] ? +process.argv[2] : 200;
const rule = Wenling.rule();

let fail = 0;
function check(cond, msg, seed) {
    if (!cond) { console.error(`✗ [seed ${seed}] ${msg}`); fail++; }
}

let stat = {
    joker_flower: 0,   // 翻出花牌作财神（此时应有 0 张财神）
    joker_normal: 0,
    total_flowers: 0,
    dealer_flowers: 0,
    total_baiban: 0,
};

for (let seed = 1; seed <= N; seed++) {
    const { shan, qipai, flowers, baiban, joker, indicator } = Wenling.qipai(rule, seed);

    const total = qipai.reduce((a, h) => a + h.length, 0)
                + flowers.reduce((a, f) => a + f.length, 0)
                + baiban.reduce((a, f) => a + f.length, 0)
                + 1 + shan.paishu;
    check(total === 144, `张数守恒 144（实际 ${total}）`, seed);

    check(qipai[0].length === 17, `庄家 17 张（实际 ${qipai[0].length}）`, seed);
    check(qipai.slice(1).every(h => h.length === 16), '闲家各 16 张', seed);
    check(qipai.every(h => h.every(p => !Pai.is_flower(p))), '手牌无残留花牌', seed);
    /* 白板当花：除非财神就是白板，否则手里不该留白板 */
    if (rule['白板当花'] && joker !== 'z5') {
        check(qipai.every(h => h.every(p => p !== 'z5')), '手牌无残留白板', seed);
    }
    /* 红中当财神时，发也当花 */
    if (rule['发当花'] && joker === 'z7') {
        check(qipai.every(h => h.every(p => p !== 'z6')), '红中财神时手牌无发', seed);
        check(baiban.reduce((a, f) => a + f.filter(p => p === 'z6').length, 0) >= 0, '发计入当花', seed);
    }

    const in_hand = qipai.reduce((a, h) => a + h.filter(p => p === joker).length, 0);
    const avail   = in_hand + shan.joker_remain;

    if (Pai.is_flower(joker)) {
        stat.joker_flower++;
        check(avail === 0, `花牌作财神时可用财神应为 0（实际 ${avail}）`, seed);
    } else {
        stat.joker_normal++;
        check(avail === 3, `财神可用应为 3 张（实际 ${avail}）`, seed);
    }

    stat.total_flowers += flowers.reduce((a, f) => a + f.length, 0);
    stat.dealer_flowers += flowers[0].length;
    stat.total_baiban  += baiban.reduce((a, f) => a + f.length, 0);

    /* 补花后庄家仍应比闲家多 1 张 */
    check(qipai[0].length - qipai[1].length === 1, '庄闲张数差 1', seed);
}

/* 庄家换人时要发到正确的座位上（P0 不是庄家时尤其重要） */
for (const d of [1, 2, 3]) {
    for (let seed = 1; seed <= 50; seed++) {
        const r = Wenling.qipai(rule, seed * 100 + d, d);
        check(r.qipai[d].length === 17,
              `庄家座位 ${d} 应 17 张（实际 ${r.qipai[d].length}）`, seed * 100 + d);
        check([0, 1, 2, 3].filter(i => i !== d).every(i => r.qipai[i].length === 16),
              `闲家应 16 张（庄家座位 ${d}）`, seed * 100 + d);
        const total2 = r.qipai.reduce((a, h) => a + h.length, 0)
                     + r.flowers.reduce((a, f) => a + f.length, 0)
                     + r.baiban.reduce((a, f) => a + f.length, 0)
                     + 1 + r.shan.paishu;
        check(total2 === 144, `庄家座位 ${d} 张数守恒 144（实际 ${total2}）`, seed * 100 + d);
    }
}

console.log(`\n跑完 ${N} 局：`);console.log(`  翻出普通牌作财神: ${stat.joker_normal} 局`);
console.log(`  翻出花牌作财神  : ${stat.joker_flower} 局`);
console.log(`  平均每局花牌数  : ${(stat.total_flowers / N).toFixed(2)} 张（8 张花牌散布在 144 张里，期望约 3.6 张被摸到）`);
console.log(`  平均庄家花牌数  : ${(stat.dealer_flowers / N).toFixed(2)} 张`);
console.log(`  平均每局白板数  : ${(stat.total_baiban / N).toFixed(2)} 张（4 张白板当花摸到，期望约 1.8 张）`);
console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exitCode = fail === 0 ? 0 : 1;
