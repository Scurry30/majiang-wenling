/*
 *  MajiangWenling.AI —— 牌效型策略
 *
 *  决策顺序：
 *    打牌：打完后向听数最小 → 有效牌最多 → 优先打字牌/幺九
 *    鸣牌：鸣完再打一张，向听数真的变小才鸣
 *    和牌：能胡就胡
 *
 *  财神：永远不打；向听数计算里它已经是万能牌。
 */
"use strict";

const Pai = require('./pai');
const { shanten, ukeire } = require('./shanten');

/* 已经看得见的牌：四家牌河 + 所有副露（用于把有效牌算准） */
function visible_counts(ctx) {
    const seen = {};
    const add = p => { seen[p] = (seen[p] || 0) + 1 };
    if (! ctx || ! ctx.game) return seen;
    const g = ctx.game;
    for (const he of g.he) for (const p of he) add(p);
    for (const h of g.hands) for (const m of h.fulou) for (const p of m.tiles) add(p);
    return seen;
}

/* 打牌：返回要打出的牌 */
function select_dapai(hand, ctx, opts = {}) {

    const joker = hand._joker;
    const list  = hand.dapai_list.filter(p => p !== joker);
    if (! list.length) return hand.dapai_list[0];

    /* 有效牌要不要扣掉已见的牌（A/B 开关） */
    const seen = opts.seen === false ? undefined : visible_counts(ctx);

    let best = null;

    for (const t of list) {
        hand.remove(t);
        const s = shanten(hand);
        const u = s <= 1 ? ukeire(hand, seen) : 0;   // 只有接近听牌时才算有效牌，省时间
        hand.add(t);

        const tie = (Pai.is_honor(t) ? 3 : 0) + (Pai.is_terminal(t) ? 2 : 0);
        const score = -s * 1000 + u;

        if (! best || score > best.score || (score === best.score && tie > best.tie))
            best = { t, score, tie };
    }
    return best.t;
}

/* 摸牌后（17 张）最优的打牌结果向听数 */
function shanten_after_discard(hand) {
    let min = 99;
    for (const t of hand.dapai_list) {
        hand.remove(t);
        min = Math.min(min, shanten(hand));
        hand.add(t);
    }
    return min;
}

function want_pon(hand, tile) {
    if (hand.count(tile) < 2) return false;
    const before = shanten(hand);
    const h = hand.clone();
    h.fulou_pon(tile, -1);
    return shanten_after_discard(h) < before;
}

function want_gang(hand, tile) {
    /* 杠会拆散手牌、还要补一张，第一版 AI 先不杠（后续可以做成「不降向听才杠」） */
    return false;
}

/* 吃：挑一个让向听变小的搭子，否则不吃 */
function select_chi(hand, options) {
    const before = shanten(hand);
    let best = null;
    for (const o of options) {
        const h = hand.clone();
        h.fulou_chi(o[0], o[1], o[0], -1);        // 第三张用占位，形不影响向听
        const after = shanten_after_discard(h);
        if (after < before && (! best || after < best.after)) best = { o, after };
    }
    return best ? best.o : null;
}

/* 完整的策略对象，直接喂给 Game。seen:false 关掉「扣除已见牌」（用于 A/B） */
function create_policy(opts = {}) {
    const use_seen = opts.seen !== false;
    return {
        dapai(hand, ctx)          { return select_dapai(hand, ctx, { seen: use_seen }) },
        hu_zimo()                 { return true },
        hu_rong()                 { return true },
        pon(hand, tile)           { return want_pon(hand, tile) },
        gang(hand, tile)          { return want_gang(hand, tile) },
        chi(hand, options)        { return select_chi(hand, options) },
        self_gang()               { return null },
    };
}

module.exports = { create_policy, select_dapai, select_chi, want_pon, want_gang,
                   visible_counts };
