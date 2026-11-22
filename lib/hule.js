/*
 *  MajiangWenling.Hule —— 和牌判定（16 张制：5 组面子 + 1 对将）
 *
 *  两个和日麻的根本差异：
 *    1. 面子要 5 组（不是 4 组），成牌 17 张（16 张手牌 + 1 张和牌）
 *    2. 财神是万能牌，可替任意牌组成顺子 / 刻子 / 将牌
 *
 *  规则约束：
 *    - 财神不能用于吃、碰、杠（副露里不允许出现财神），所以只在本函数内当通配符
 *    - 财神本身不计胡头，分解结果用 '*' 标出财神，供算分时区分
 *    - 没有七对牌型
 */
"use strict";

const Pai = require('./pai');

const KINDS = Pai.KINDS;
const IDX   = Pai.KIND_INDEX;

const WILD = '*';

/* 手牌 → 34 格计数；财神单独计数，不落到牌种格子里 */
function to_counts(pai, joker) {
    const counts = new Array(34).fill(0);
    let jokers = 0;
    for (const p of pai) {
        if (p === joker) jokers++;
        else {
            const i = IDX.get(p);
            if (i == null) throw new Error(`未知牌: ${p}`);
            counts[i]++;
        }
    }
    return { counts, jokers };
}

/**
 * 把 counts 拆成 sets 个面子，财神可替任意牌。
 * @returns {string[][]|null} 面子列表，财神位置用 '*'
 */
function form_sets(counts, jokers, sets) {

    if (sets === 0) {
        return (counts.every(c => c === 0) && jokers === 0) ? [] : null;
    }

    const i = counts.findIndex(c => c > 0);

    /* 只剩财神：每 3 张财神凑一个面子 */
    if (i < 0) {
        if (jokers !== sets * 3) return null;
        const rv = [];
        for (let k = 0; k < sets; k++) rv.push([WILD, WILD, WILD]);
        return rv;
    }

    /* 方案一：刻子（优先用实体牌，不足用财神补） */
    const use  = Math.min(counts[i], 3);
    const need = 3 - use;
    if (need <= jokers) {
        counts[i] -= use;
        const rest = form_sets(counts, jokers - need, sets - 1);
        counts[i] += use;
        if (rest) {
            const mianzi = [];
            for (let k = 0; k < use;  k++) mianzi.push(KINDS[i]);
            for (let k = 0; k < need; k++) mianzi.push(WILD);
            return [mianzi].concat(rest);
        }
    }

    /* 方案二：顺子（仅数牌，起点 1-7） */
    if (i < 27 && i % 9 <= 6) {
        const trio = [i, i + 1, i + 2];
        const take = trio.map(k => counts[k] > 0 ? 1 : 0);
        const needj = take.reduce((a, b) => a + (b ? 0 : 1), 0);
        if (needj <= jokers) {
            trio.forEach((k, x) => { counts[k] -= take[x] });
            const rest = form_sets(counts, jokers - needj, sets - 1);
            trio.forEach((k, x) => { counts[k] += take[x] });
            if (rest) {
                const mianzi = trio.map((k, x) => take[x] ? KINDS[k] : WILD);
                return [mianzi].concat(rest);
            }
        }
    }

    return null;
}

/**
 * 和牌判定。
 * @param {string[]} pai    手牌（含和牌张）
 * @param {string}   joker  财神牌种
 * @param {number}   n_fulou 已副露的面子数
 * @returns {{mianzi: string[][], pair: string[], jokers: number}|null}
 */
function hule(pai, joker, n_fulou = 0) {

    const { counts, jokers } = to_counts(pai, joker);
    const need_sets = 5 - n_fulou;
    if (need_sets < 0) return null;

    const total = pai.length;
    if (total !== need_sets * 3 + 2) return null;

    /* 将牌候选：实体对子 / 单张 + 财神 / 双财神 */
    const candidates = [];
    for (let i = 0; i < 34; i++) if (counts[i] >= 2) candidates.push({ kind: i, use: 2, joker: 0 });
    for (let i = 0; i < 34; i++) if (counts[i] === 1) candidates.push({ kind: i, use: 1, joker: 1 });
    candidates.push({ kind: -1, use: 0, joker: 2 });

    for (const c of candidates) {
        if (c.joker > jokers) continue;
        const rest = counts.slice();
        if (c.use) rest[c.kind] -= c.use;
        const mianzi = form_sets(rest, jokers - c.joker, need_sets);
        if (mianzi) {
            const pair = [];
            if (c.kind >= 0) { pair.push(KINDS[c.kind], KINDS[c.kind]); }
            for (let k = 0; k < c.joker; k++) pair.push(WILD);
            return { mianzi, pair, jokers };
        }
    }
    return null;
}

/**
 * 听牌：给出 16 张（或 16 - 3*n_fulou + ...）手牌，算出所有能和的牌种。
 * @param {string[]} pai 未和牌的手牌
 * @param {string} joker
 * @param {number} n_fulou
 * @returns {string[]} 可以和的牌种
 */
function tingpai(pai, joker, n_fulou = 0) {
    const rv = [];
    for (const k of KINDS) {
        if (hule(pai.concat([k]), joker, n_fulou)) rv.push(k);
    }
    /* 财神当任何牌都能和时，胡财神本身也算一种听牌 */
    return rv;
}

module.exports = { hule, tingpai, to_counts, form_sets, WILD };
