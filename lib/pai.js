/*
 *  MajiangWenling.Pai —— 温岭麻将的牌模型
 *
 *  牌用两个字符表示，沿用主工程的记法，方便直接复用现有牌图：
 *    m1-m9  万    p1-p9  筒    s1-s9  条
 *    z1-z7  东南西北白发中
 *    f1-f8  梅兰竹菊春夏秋冬（温岭新增，各 1 张）
 *
 *  全套 144 张 = 34 种数牌/字牌 × 4 + 8 张花牌
 */
"use strict";

const SUITS   = ['m', 'p', 's'];
const HONORS  = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'];
const FLOWERS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];

const HONOR_NAME  = ['东', '南', '西', '北', '白', '发', '中'];
const FLOWER_NAME = { f1: '梅', f2: '兰', f3: '竹', f4: '菊',
                      f5: '春', f6: '夏', f7: '秋', f8: '冬' };

// 花牌归属座位风：0=东 1=南 2=西 3=北
// 东家 春、梅 / 南家 夏、兰 / 西家 秋、竹 / 北家 冬、菊
const FLOWER_SEAT = { f1: 0, f5: 0, f2: 1, f6: 1, f3: 2, f7: 2, f4: 3, f8: 3 };

// 花牌分组（腊子「集齐 4 张红花 / 4 张黑花」用）
//   红花 = 四季花：春、夏、秋、冬（牌面印红）
//   黑花 = 四君子：梅、兰、竹、菊（水墨黑）
const FLOWER_COLOR = { f1: 'black', f2: 'black', f3: 'black', f4: 'black',
                       f5: 'red',   f6: 'red',   f7: 'red',   f8: 'red' };

const FLOWER_RED   = ['f5', 'f6', 'f7', 'f8'];   // 春夏秋冬
const FLOWER_BLACK = ['f1', 'f2', 'f3', 'f4'];   // 梅兰竹菊

function valid(p) {
    return /^[mps][1-9]$/.test(p) || /^z[1-7]$/.test(p) || /^f[1-8]$/.test(p);
}

function is_flower(p)   { return p[0] === 'f' }
function is_honor(p)    { return p[0] === 'z' }
function is_terminal(p) { return /^[mps][19]$/.test(p) }   // 幺九
function is_simple(p)   { return /^[mps][2-8]$/.test(p) }  // 中张

// 胡头表里的「软张 / 硬张」：软张 = 2-8 的万筒条；硬张 = 幺九 + 字牌
function is_soft(p) { return is_simple(p) }
function is_hard(p) { return is_terminal(p) || is_honor(p) }

function suit(p) { return p[0] }
function num(p)  { return +p[1] }

// 顺子判定（花牌、字牌不参与）
function is_shunzi(a, b, c) {
    if (a[0] !== b[0] || b[0] !== c[0]) return false;
    if (!'mps'.includes(a[0]))          return false;
    return +a[1] + 1 === +b[1] && +b[1] + 1 === +c[1];
}

function sort_key(p) {
    const order = 'mpszf';
    return order.indexOf(p[0]) * 100 + (+p[1] || 0);
}

function sort(pai) { return pai.slice().sort((a, b) => sort_key(a) - sort_key(b)) }

// 全部牌种（不含花），用于向听/和牌的索引
const KINDS = (() => {
    const rv = [];
    for (const s of SUITS) for (let n = 1; n <= 9; n++) rv.push(s + n);
    for (const z of HONORS) rv.push(z);
    return rv;                       // 34 种
})();

const KIND_INDEX = new Map(KINDS.map((p, i) => [p, i]));

module.exports = {
    SUITS, HONORS, FLOWERS, KINDS, KIND_INDEX,
    HONOR_NAME, FLOWER_NAME, FLOWER_SEAT, FLOWER_COLOR, FLOWER_RED, FLOWER_BLACK,
    valid, is_flower, is_honor, is_terminal, is_simple,
    is_soft, is_hard, suit, num, is_shunzi, sort_key, sort,
};
