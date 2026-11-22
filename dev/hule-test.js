/*
 *  和牌判定自检。用法: node dev/hule-test.js
 */
"use strict";

const Wenling = require('../lib');
const { hule, tingpai } = require('../lib/hule');

/* 'm123p456z11' → ['m1','m2','m3','p4','p5','p6','z1','z1'] */
function parse(s) {
    const rv = [];
    let suit = null;
    for (const ch of s.replace(/[\s,]/g, '')) {
        if ('mpszf'.includes(ch)) suit = ch;
        else rv.push(suit + ch);
    }
    return rv;
}

let fail = 0;
function t(name, got, want) {
    const ok = got === want;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  期望 ${want}，实际 ${got}`}`);
    if (!ok) fail++;
}

const J = 'p9';   // 财神种：9 筒（手里出现的 p9 一律当财神）

/* 1. 无财神的基本和牌：5 面子 + 将 = 17 张 */
t('5 面子 + 将（无财神）',
  !!hule(parse('m123456789 p123456 z11'), J), true);

/* 2. 1 张财神替一张牌 */
t('1 张财神补顺子',
  !!hule(parse('m12 m456 m789 p123 p456 z11') .concat(['p9']), J), true);

/* 3. 财神当将牌 */
t('1 张财神作将牌',
  !!hule(parse('m123 m456 m789 p123 p456 z1').concat(['p9']), J), true);

/* 4. 双财神 */
t('2 张财神',
  !!hule(parse('m123 m456 m789 p123 p45 z1').concat(['p9', 'p9']), J), true);

/* 5. 三财神 = 一个刻子 */
t('3 张财神自成刻子',
  !!hule(parse('m123 m456 p123 p456 z11').concat(['p9', 'p9', 'p9']), J), true);

/* 6. 不能和：差一张 */
t('差一张不和',
  !!hule(parse('m123 m456 m789 p123 p456 z12'), J), false);

/* 7. 字牌不能组顺子 */
t('字牌不成顺子',
  !!hule(parse('z123 z456 m123 m456 p123 s11'), J), false);

/* 8. 副露 2 组：手上只需 3 面子 + 将 = 11 张 */
t('副露 2 组时的和牌',
  !!hule(parse('m123 m456 p123 z11'), J, 2), true);

/* 9. 财神不能当副露：副露已由 n_fulou 计入，手里多给一张财神仍应能判 */
t('副露 2 组 + 1 财神',
  !!hule(parse('m12 m456 p123 z11').concat(['p9']), J, 2), true);

/* 10. 听牌：16 张等一张 */
const hand16 = parse('m123 m456 m789 p123 p456 z1');
const waits  = tingpai(hand16, J);
t('听牌含 z1', waits.includes('z1'), true);
console.log(`   （听 ${waits.length} 种：${waits.join(' ')}）`);

/* 11. 财神让听牌变宽（财神在手，任何牌都可能和） */
const hand_joker = parse('m123 m456 m789 p123 p45 z1').concat(['p9']);
const waits2 = tingpai(hand_joker, J);
t('带财神时听牌变宽', waits2.length > 3, true);
console.log(`   （听 ${waits2.length} 种：${waits2.join(' ')}）`);

console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exitCode = fail ? 1 : 0;
