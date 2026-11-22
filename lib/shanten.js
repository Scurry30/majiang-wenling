/*
 *  MajiangWenling.Shanten —— 向听数（16 张制 / 5 面子 + 1 将 / 含财神）
 *
 *  向听数定义：
 *    -1 = 已和牌
 *     0 = 听牌
 *     n = 还差 n 步
 *
 *  公式：shanten = 暗牌张数 - (3×面子 + 2×搭子 + 将) - 1
 *  财神是万能牌，可以补刻子/顺子/搭子/将，用 DFS 搜索最优分解。
 */
"use strict";

const Pai = require('./pai');

const KINDS = Pai.KINDS;

/* 返回 max(3m + 2d + g)，约束：m ≤ need、m+d ≤ need、g ≤ 1 */
function best_decompose(counts, jokers, need) {

    const memo = new Map();
    const NEG  = -1e9;

    function rec(i, jok, m, d, g) {

        if (m > need || m + d > need) return NEG;

        while (i < 34 && counts[i] === 0) i++;

        const key = `${i}|${jok}|${need - m}|${need - m - d}|${g}|${counts.slice(i).join('')}`;
        if (memo.has(key)) return memo.get(key);

        let best = 3 * m + 2 * d + g;

        if (i >= 34) { memo.set(key, best); return best }

        const c = counts[i];

        /* 刻子（不足用财神补） */
        if (m < need) {
            const use = Math.min(c, 3), nd = 3 - use;
            if (nd <= jok) {
                counts[i] -= use;
                best = Math.max(best, rec(i, jok - nd, m + 1, d, g));
                counts[i] += use;
            }
        }

        /* 顺子（仅数牌，起点 1-7） */
        if (m < need && i < 27 && i % 9 <= 6) {
            const trio = [i, i + 1, i + 2];
            const take = trio.map(k => counts[k] > 0 ? 1 : 0);
            const nd   = take.reduce((a, b) => a + (b ? 0 : 1), 0);
            if (nd <= jok) {
                trio.forEach((k, x) => { counts[k] -= take[x] });
                best = Math.max(best, rec(i, jok - nd, m + 1, d, g));
                trio.forEach((k, x) => { counts[k] += take[x] });
            }
        }

        /* 将（对子 / 单张 + 财神 / 双财神） */
        if (g === 0) {
            let use = 0, nd = 0;
            if      (c >= 2) use = 2;
            else if (c >= 1) { use = 1; nd = 1 }
            else             { use = 0; nd = 2 }
            if (nd <= jok) {
                counts[i] -= use;
                best = Math.max(best, rec(i, jok - nd, m, d, 1));
                counts[i] += use;
            }
        }

        /* 搭子：对子、两面、边张、嵌张 */
        if (m + d < need) {
            if (c >= 2) {
                counts[i] -= 2;
                best = Math.max(best, rec(i, jok, m, d + 1, g));
                counts[i] += 2;
            }
            for (const step of [1, 2]) {
                const j = i + step;
                if (j >= 27 || Math.floor(i / 9) !== Math.floor(j / 9)) continue;
                const have = counts[j] > 0 ? 1 : 0;
                const nd   = 1 - have;
                if (nd > jok) continue;
                counts[i] -= 1;
                if (have) counts[j] -= 1;
                best = Math.max(best, rec(i, jok - nd, m, d + 1, g));
                counts[i] += 1;
                if (have) counts[j] += 1;
            }
        }

        /* 这张不要了 */
        counts[i] -= 1;
        best = Math.max(best, rec(i, jok, m, d, g));
        counts[i] += 1;

        memo.set(key, best);
        return best;
    }

    return rec(0, jokers, 0, 0, 0);
}

/**
 * 向听数。传入的是「16 张形态」（打牌前的 17 张请先假设打掉一张）。
 * @param {Shoupai} hand
 */
function shanten(hand) {
    const counts = hand.counts();
    const jokers = hand.jokers;
    const need   = 5 - hand.fulou.length;
    const closed = counts.reduce((a, b) => a + b, 0) + jokers;

    /* 16 张（3n+1）是静止形态；17 张（3n+2）是摸牌后形态，
       两者的「差一步」常数不同：17 张已和牌时是 -1。 */
    const extra  = (closed === 3 * need + 2) ? 2 : 1;
    return closed - best_decompose(counts, jokers, need) - extra;
}

/**
 * 有效牌张数：摸到它能降低向听数的牌，还剩几张。
 * @param {Shoupai} hand
 * @param {object} seen 已见牌计数（可选）
 */
function ukeire(hand, seen) {
    const base = shanten(hand);
    if (base <= -1) return 0;
    let total = 0;
    for (const k of KINDS) {
        if (k === hand._joker) continue;              // 财神本身不参与计算
        if (hand.count(k) >= 4) continue;
        hand.add(k);
        const s = shanten(hand);
        hand.remove(k);
        if (s < base) total += 4 - hand.count(k) - ((seen && seen[k]) || 0);
    }
    return total;
}

module.exports = { shanten, ukeire, best_decompose };
