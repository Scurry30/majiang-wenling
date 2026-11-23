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

const IDX   = Pai.KIND_INDEX;
const KINDS = Pai.KINDS;

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

/**
 * 台数潜力：0~3，代表「照这个牌型做下去大概能多几台」。
 * 只在听牌阶段用来比较等牌价值，不参与打牌阶段的取舍。
 */
function shape_tai(hand, ctx) {
    const counts = hand.counts();
    const joker  = hand._joker;

    let m = 0, p = 0, s = 0, z = 0;
    for (let i = 0; i < 9;  i++) m += counts[i];
    for (let i = 9; i < 18; i++) p += counts[i];
    for (let i = 18; i < 27; i++) s += counts[i];
    for (let i = 27; i < 34; i++) z += counts[i];

    const num = m + p + s;
    const arr = [m, p, s].sort((a, b) => b - a);

    let tai = 0;

    /* 一色 */
    if (num >= 8) {
        if (arr[1] + arr[2] === 0)                              tai += 2;
        else if (arr[0] >= num * 0.72 && arr[1] + arr[2] <= 3)  tai += 1;
    }

    /* 对对胡 */
    let sets = 0, pairs = 0;
    for (let i = 0; i < 34; i++) {
        if (counts[i] >= 3) sets++;
        else if (counts[i] === 2) pairs++;
    }
    if (sets >= 1 && sets + pairs >= 4) tai += 1;

    /* 闹闹：非财神的中发白对子/刻子 */
    if (ctx && ctx.nao) {
        for (const k of ['z5', 'z6', 'z7']) {
            if (k === joker) continue;
            if (counts[IDX.get(k)] >= 2) tai += 1;
        }
    }

    /* 门风 */
    if (ctx) {
        const mf = 'z' + (ctx.menfeng + 1);
        if (mf !== joker && counts[IDX.get(mf)] >= 2) tai += 0.5;
    }

    /* 腊子：2 张财神 / 某种花已 3 张 */
    if (hand.jokers >= 2) tai += 2;
    const red   = ['f5', 'f6', 'f7', 'f8'].filter(f => hand.flowers.includes(f)).length;
    const black = ['f1', 'f2', 'f3', 'f4'].filter(f => hand.flowers.includes(f)).length;
    if (Math.max(red, black) >= 3) tai += 2;

    return tai;
}

/* 听牌价值：等牌总张数 × 2^台数潜力 */
function wait_value(hand, ctx, seen) {
    const waits = hand.tingpai();
    if (! waits.length) return 0;
    let n = 0;
    for (const k of waits) {
        const left = 4 - hand.count(k) - ((seen && seen[k]) || 0);
        if (left > 0) n += left;
    }
    return n * Math.pow(2, shape_tai(hand, ctx));
}

/* 打牌：返回要打出的牌 */
function select_dapai(hand, ctx, opts = {}) {

    const joker = hand._joker;
    const list  = hand.dapai_list.filter(p => p !== joker);
    if (! list.length) return hand.dapai_list[0];

    /* 有效牌要不要扣掉已见的牌（A/B 开关） */
    const seen     = opts.seen === false ? undefined : visible_counts(ctx);
    const use_wait = opts.wait !== false;

    let best = null;

    for (const t of list) {
        hand.remove(t);
        const s = shanten(hand);

        let value;
        if (s === 0 && use_wait) value = wait_value(hand, ctx, seen);   // 听牌：比等牌价值
        else                     value = s <= 1 ? ukeire(hand, seen) : 0;

        hand.add(t);

        const tie = (Pai.is_honor(t) ? 3 : 0) + (Pai.is_terminal(t) ? 2 : 0);
        const score = -s * 1000 + Math.min(value, 400);

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

/**
 * 有效牌：摸到它能降低向听数，且还有剩余的张数。
 * 注意：在克隆的手牌上算，避免反复 add/remove 打乱玩家手牌顺序。
 * @returns {Array<{tile, left}>}
 */
function effective_tiles(hand, seen) {
    const work = hand.clone();
    const base = shanten(work);
    if (base <= -1) return [];
    const rv = [];
    for (const k of KINDS) {
        if (k === hand._joker) continue;
        if (work.count(k) >= 4) continue;
        work.add(k);
        const s = shanten(work);
        work.remove(k);
        if (s < base) {
            const left = 4 - work.count(k) - ((seen && seen[k]) || 0);
            if (left > 0) rv.push({ tile: k, left });
        }
    }
    return rv;
}

/* 听牌表：每张等牌还剩几张 */
function waits_of(hand, seen) {
    return hand.tingpai().map(k => {
        const left = 4 - hand.count(k) - ((seen && seen[k]) || 0);
        return { tile: k, left: Math.max(0, left) };
    }).filter(w => w.left > 0);
}

/**
 * 牌效分析（给界面用，也方便调试 AI）。
 * 17 张（摸牌后）返回每个候选打牌的向听/有效牌；16 张只返回当前向听与听牌。
 */
function analyze(hand, ctx, opts = {}) {
    /* 在克隆上算，绝不改动玩家真实手牌的顺序 */
    const work = hand.clone();
    const seen = opts.seen === false ? undefined : visible_counts(ctx);
    const need = (5 - work.fulou.length) * 3 + 2;
    const is17 = work.pai.length === need;

    if (! is17) {
        const s = shanten(work);
        return {
            is17: false, shanten: s,
            waits: s === 0 ? waits_of(work, seen) : [],
            candidates: [], best: null,
        };
    }

    const list = work.dapai_list.filter(p => p !== work._joker);

    /* 第一步：只算向听（便宜） */
    const rows = list.map(t => {
        work.remove(t);
        const s = shanten(work);
        work.add(t);
        return { tile: t, shanten: s };
    });

    /* 第二步：只对「向听最优」的那些候选算有效牌/听牌（贵） */
    const min_s = Math.min(...rows.map(r => r.shanten));

    const candidates = rows.map(r => {
        if (r.shanten > min_s) return { ...r, ukeire: 0, waits: [], pot: 0, score: -r.shanten * 1000 };

        work.remove(r.tile);
        const s = r.shanten;
        const waits = s === 0 ? waits_of(work, seen) : [];
        const effective = s === 0 ? waits : effective_tiles(work, seen);
        const u = effective.reduce((a, w) => a + w.left, 0);
        const pot = s === 0 ? shape_tai(work, ctx) : 0;
        work.add(r.tile);

        const value = s === 0 ? Math.min(u * Math.pow(2, pot), 400) : u;
        return { tile: r.tile, shanten: s, ukeire: u, waits, effective, pot,
                 score: -s * 1000 + value };
    }).sort((a, b) => b.score - a.score);

    return {
        is17: true,
        shanten: min_s,
        candidates,
        best: candidates[0] || null,
    };
}

/* 完整的策略对象，直接喂给 Game。seen:false 关掉「扣除已见牌」（用于 A/B） */
function create_policy(opts = {}) {
    const use_seen = opts.seen !== false;
    const use_wait = opts.wait !== false;
    return {
        dapai(hand, ctx)          { return select_dapai(hand, ctx, { seen: use_seen, wait: use_wait }) },
        hu_zimo()                 { return true },
        hu_rong()                 { return true },
        pon(hand, tile)           { return want_pon(hand, tile) },
        gang(hand, tile)          { return want_gang(hand, tile) },
        chi(hand, options)        { return select_chi(hand, options) },
        self_gang()               { return null },
    };
}

module.exports = { create_policy, select_dapai, select_chi, want_pon, want_gang,
                   visible_counts, shape_tai, wait_value, waits_of, analyze,
                   effective_tiles };
