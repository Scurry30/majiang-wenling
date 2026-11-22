/*
 *  MajiangWenling.Score —— 胡头 / 台数 / 腊子 / 结算
 *
 *  分数 = 胡头 × 2^台数
 *    胡头 = 面子胡头 + 将牌胡头 + 花牌胡头 + 底胡(20) + 自摸(4)
 *    台数 = 各项台数之和
 *
 *  结算（温岭特色）：
 *    1. 胡家：另外三家各付一份分数，不设放炮承包
 *    2. 未胡的三家之间：按各自「手牌基础胡头」两两算差额，多的一方收
 *    3. 腊子：直接封顶 500，不套公式，但闲家两两差额照常
 */
"use strict";

const Pai = require('./pai');

const WILD = '*';

/* 面子结构：
 *   { kind: 'shunzi' | 'kezi' | 'gang', tile, fulou: bool, angang: bool, n_joker: number }
 * 将牌结构：
 *   { tile, n_joker }
 */

function hard_or_soft(tile) { return Pai.is_hard(tile) ? '硬' : '软' }

/* 单个面子的胡头。规则：财神拼凑出的面子不计胡头 */
function mianzi_hutou(m, rule) {
    if (m.n_joker > 0)      return 0;
    if (m.kind === 'shunzi') return 0;
    const h = hard_or_soft(m.tile);
    if (m.kind === 'kezi')   return rule[(m.fulou ? '明刻' : '暗刻') + h];
    if (m.kind === 'gang')   return rule[(m.angang ? '暗杠' : '明杠') + h];
    return 0;
}

function pair_hutou(pair, rule) {
    if (!pair || pair.n_joker > 0) return 0;
    return rule[Pai.is_hard(pair.tile) ? '将牌硬张胡头' : '将牌软张胡头'];
}

/* 手牌基础胡头：面子 + 将牌 + 花牌（不含底胡、自摸加成、台数） */
function base_hutou(ctx) {
    const rule = ctx.rule ?? {};
    let h = 0;
    for (const m of ctx.mianzi) h += mianzi_hutou(m, rule);
    h += pair_hutou(ctx.pair, rule);
    h += (ctx.flowers || []).length * (rule['花牌胡头'] ?? 0);
    return h;
}

/* 台数明细 */
function tai_list(ctx) {
    const rule = ctx.rule ?? {};
    const rv = [];
    const add = (name, tai) => { if (tai) rv.push({ name, tai }) };

    /* 自家花：只有归属自己座位风的花才算台 */
    const own = (ctx.flowers || []).filter(f => Pai.FLOWER_SEAT[f] === ctx.seat).length;
    add('自家花', own * (rule['自家花台'] ?? 0));

    /* 门风刻（自风刻子/杠） */
    const menfeng = 'z' + (ctx.seat + 1);
    add('门风刻', ctx.mianzi.some(m => m.kind !== 'shunzi' && m.tile === menfeng)
                    ? rule['门风刻台'] : 0);

    /* 牌型台 */
    add('平胡',   ctx.mianzi.every(m => m.kind === 'shunzi')  ? rule['平胡台']   : 0);
    add('对对胡', ctx.mianzi.every(m => m.kind !== 'shunzi') ? rule['对对胡台'] : 0);

    /* 财神相关 */
    add('自摸财神', ctx.win_by_joker ? rule['自摸财神台'] : 0);
    add('双财神',   (ctx.jokers || 0) >= 2 ? rule['双财神台'] : 0);
    add('硬胡',     (ctx.jokers || 0) === 0 ? rule['硬胡台']  : 0);
    add('财神归位', ctx.guiwei ? rule['财神归位台'] : 0);

    /* 胡牌方式 */
    add('杠上开花', ctx.gangshang ? rule['杠上台']  : 0);
    add('抢杠',     ctx.qianggang ? rule['抢杠台']  : 0);

    /* 闹闹模式：非财神的中发白刻子/杠，每个 1 台 */
    if (ctx.nao) {
        const n = ctx.mianzi.filter(m => m.kind !== 'shunzi'
                    && ['z5', 'z6', 'z7'].includes(m.tile)
                    && m.tile !== ctx.joker).length;
        add('闹闹', n * (rule['闹闹台'] ?? 0));
    }

    /* 一色：数牌只用一种花色 + 是否有字牌 */
    const nums = new Set();       // 数牌花色
    let has_honor = false;
    const take = (tile, n_joker) => {
        if (n_joker > 0) return;              // 财神不算花色
        if (Pai.is_honor(tile)) has_honor = true;
        else                    nums.add(Pai.suit(tile));
    };
    for (const m of ctx.mianzi) take(m.tile, m.kind === 'shunzi' ? 0 : m.n_joker);
    if (ctx.pair) take(ctx.pair.tile, ctx.pair.n_joker);

    if (nums.size === 1) {
        if (has_honor) add('混一色', rule['混一色台']);
        else           add('清一色', rule['清一色台']);
    }
    else if (nums.size === 0 && has_honor) {
        /* 字一色：温岭不计台，留空 */
    }

    return rv;
}

/* 腊子判定 */
function lazi_list(ctx) {
    const rule = ctx.rule ?? {};
    const rv = [];

    if ((ctx.jokers || 0) >= 3 && rule['腊子三财神']) rv.push('三得腊子');

    const flowers = ctx.flowers || [];
    const has = (set) => set.every(f => flowers.includes(f));
    if (has(Pai.FLOWER_RED)   && rule['腊子四红花']) rv.push('四红花');
    if (has(Pai.FLOWER_BLACK) && rule['腊子四黑花']) rv.push('四黑花');

    if (rule['腊子四风齐']) {
        const winds = ['z1', 'z2', 'z3', 'z4'];
        if (winds.every(z => ctx.mianzi.some(m => m.kind !== 'shunzi' && m.tile === z)))
            rv.push('四风齐');
    }

    return rv;
}

/**
 * 计算一家的得分。
 * @param {object} ctx { mianzi, pair, flowers, jokers, seat, zimo, win_by_joker,
 *                       guiwei, gangshang, qianggang, nao, joker, rule }
 */
function score(ctx) {
    const rule = ctx.rule ?? {};
    const base  = base_hutou(ctx);
    const list  = tai_list(ctx);
    const tai   = list.reduce((a, t) => a + t.tai, 0);
    const lazi  = lazi_list(ctx);

    let defen, hutou_total;
    if (lazi.length) {
        defen = rule['腊子封顶'];
        hutou_total = base + rule['底胡'] + (ctx.zimo ? rule['自摸加成'] : 0);
    }
    else {
        hutou_total = base + rule['底胡'] + (ctx.zimo ? rule['自摸加成'] : 0);
        defen = hutou_total * Math.pow(2, tai);
    }

    return { base, hutou: hutou_total, tai, tai_list: list, lazi, defen,
             lazi_hit: lazi.length > 0 };
}

/**
 * 结算。返回每家净收支（正数收入，负数支出）。
 * @param {Array} players [{ seat, is_winner, base, defen }]
 */
function settle(players) {
    const n = players.length;
    const delta = new Array(n).fill(0);
    const w = players.findIndex(p => p.is_winner);

    /* 胡家：另外三家各付整份 */
    if (w >= 0) {
        for (let i = 0; i < n; i++) {
            if (i === w) continue;
            delta[i] -= players[w].defen;
            delta[w] += players[w].defen;
        }
    }

    /* 未胡的几家两两按基础胡头算差额（流局时四家都参与） */
    const rest = players.map((p, i) => i).filter(i => i !== w);
    for (let a = 0; a < rest.length; a++) {
        for (let b = a + 1; b < rest.length; b++) {
            const i = rest[a], j = rest[b];
            const d = players[i].base - players[j].base;
            delta[i] += d;
            delta[j] -= d;
        }
    }

    return delta;
}

/**
 * 未胡玩家的「手牌基础胡头」：副露 + 暗刻 + 一对将 + 花牌。
 * 温岭的闲家两两结算用的就是这个数（不加底胡、不加自摸、不乘台）。
 */
function hutou_of_hand(hand, rule) {
    let h = 0;

    for (const f of hand.fulou) {
        h += mianzi_hutou({
            kind:    f.kind === 'chi' ? 'shunzi' : (f.kind === 'pon' ? 'kezi' : 'gang'),
            tile:    f.tile,
            fulou:   f.kind !== 'angang',
            angang:  f.kind === 'angang',
            n_joker: 0,
        }, rule);
    }

    const counts = hand.counts();
    for (let i = 0; i < 34; i++) {
        if (counts[i] >= 3) {
            const tile = Pai.KINDS[i];
            h += rule[Pai.is_hard(tile) ? '暗刻硬' : '暗刻软'];
        }
    }

    /* 一对将：优先硬张（软张对子 0 胡头，不必再找） */
    for (let i = 0; i < 34; i++) {
        const tile = Pai.KINDS[i];
        if (counts[i] >= 2 && Pai.is_hard(tile)) { h += rule['将牌硬张胡头']; break }
    }

    h += hand.flowers.length * rule['花牌胡头'];
    return h;
}

module.exports = {
    score, settle, base_hutou, mianzi_hutou, pair_hutou, tai_list, lazi_list,
    hutou_of_hand,
};
