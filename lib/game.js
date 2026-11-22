/*
 *  MajiangWenling.Game —— 局进行
 *
 *  流程：配牌(16/17) → 翻财神 → 补花 → 庄家打牌 → 逆时针摸打
 *        摸到花牌尾部补、杠后头部补；剩 8 墩流局
 *        一炮一响：逆时针优先（下家 > 对家 > 上家）
 *        财神不能用于吃、碰、杠；杠上开花 / 抢杠加成
 *
 *  policy（全部可选，缺省 = 不鸣牌、打第一张）：
 *    dapai(hand, ctx)
 *    hu_zimo(hand, ctx) / hu_rong(hand, tile, ctx)
 *    pon(hand, tile, ctx) / gang(hand, tile, ctx)
 *    chi(hand, options, tile, ctx) -> [a,b] | null
 *    self_gang(hand, ctx) -> {type:'angang'|'kakan', tile} | null
 */
"use strict";

const Pai     = require('./pai');
const Shan    = require('./shan');
const Shoupai = require('./shoupai');
const Score   = require('./score');

const SEAT_NAME = ['东', '南', '西', '北'];

class Game {

    constructor(rule, policy = {}, opts = {}) {
        this._rule   = rule;
        this._policy = policy;
        this._seed   = opts.seed;
        this._zhuang = opts.zhuang ?? 0;

        this._hands = [];
        this._he    = [[], [], [], []];
        this._score = [0, 0, 0, 0];
        this._log   = [];
        this._nao   = false;
    }

    get zhuang() { return this._zhuang }
    get score()  { return this._score }
    get log()    { return this._log }
    get shan()   { return this._shan }
    get nao()    { return this._nao }
    get hands()  { return this._hands }
    get he()     { return this._he }

    menfeng(player) { return (player - this._zhuang + 4) % 4 }
    seat_name(player) { return SEAT_NAME[this.menfeng(player)] }

    log_action(player, action, detail = '') {
        const rec = { player, action, detail };
        this._log.push(rec);
        this._on_log && this._on_log(rec);
    }

    /* ---------- 开局 ---------- */

    kaiju() {
        const { shan, qipai, flowers, joker, indicator } = Shan.qipai(this._rule, this._seed);
        this._shan      = shan;
        this._joker     = joker;
        this._indicator = indicator;
        this._hands     = qipai.map(hand => Shoupai.from(hand, this._rule, joker));
        flowers.forEach((fs, i) => fs.forEach(f => this._hands[i].add_flower(f)));

        this._nao  = ['z5', 'z6', 'z7'].includes(joker) || Pai.is_flower(joker);
        this._turn = this._zhuang;

        this.log_action(null, '开局',
            `财神 ${joker}${this._nao ? '（闹闹）' : ''}，牌墙 ${shan.paishu} 张`);
        return this;
    }

    /* ---------- 摸牌 ---------- */

    _draw(turn) {
        let p = this._shan.zimo();
        while (Pai.is_flower(p)) {
            this._hands[turn].add_flower(p);
            this.log_action(turn, '补花', Pai.FLOWER_NAME[p]);
            p = this._shan.buhua();
        }
        this._hands[turn].add(p);
        return p;
    }

    _draw_gang(turn) {
        let p = this._shan.zimo();
        while (Pai.is_flower(p)) {
            this._hands[turn].add_flower(p);
            p = this._shan.buhua();
        }
        this._hands[turn].add(p);
        return p;
    }

    /* 牌墙剩 8 墩（16 张）即流局 */
    _exhausted() { return this._shan.paishu <= this._rule['流局剩余墩'] * 2 }

    _ctx(player) {
        return { game: this, player, menfeng: this.menfeng(player),
                 zhuang: this._zhuang, joker: this._joker, nao: this._nao,
                 shan: this._shan, rule: this._rule };
    }

    /* ---------- 主循环 ---------- */

    run() {
        if (! this._hands.length) this.kaiju();

        let turn      = this._turn;
        let need_draw = true;

        for (;;) {

            if (need_draw) {
                if (this._exhausted()) return this._pingju();

                let drawn = this._draw(turn);
                let res   = this._try_zimo(turn, drawn, false);
                if (res) return res;

                /* 暗杠 / 加杠 */
                const g = this._policy.self_gang
                        ? this._policy.self_gang(this._hands[turn], this._ctx(turn)) : null;
                if (g) {
                    const hand = this._hands[turn];
                    const tile = g.tile;

                    if (g.type === 'kakan') {
                        /* 抢杠：别人可以荣和这张加杠的牌 */
                        const rong = this._claim_rong(turn, tile);
                        if (rong) return this._hule(rong, { win_tile: tile, qianggang: true });
                        hand.kakan(tile);
                        this.log_action(turn, '加杠', tile);
                    }
                    else {
                        hand.angang(tile);
                        this.log_action(turn, '暗杠', tile);
                    }

                    const gd = this._draw_gang(turn);
                    res = this._try_zimo(turn, gd, true);      // 杠上开花
                    if (res) return res;
                }
            }

            /* 打牌 */
            const hand = this._hands[turn];
            const p    = this._policy.dapai
                       ? this._policy.dapai(hand, this._ctx(turn))
                       : hand.dapai_list[0];
            hand.remove(p);
            this._he[turn].push(p);
            this.log_action(turn, '打', p);

            /* 宣言 */
            const claim = this._claim(turn, p);
            if (claim) {
                if (claim.type === 'hu') return this._hule(claim.player, { win_tile: p });

                const h = this._hands[claim.player];
                if (claim.type === 'pon') {
                    h.fulou_pon(p, turn);
                    this.log_action(claim.player, '碰', p);
                }
                else if (claim.type === 'gang') {
                    h.fulou_gang(p, turn);
                    this.log_action(claim.player, '杠', p);
                    const gd = this._draw_gang(claim.player);
                    const r  = this._try_zimo(claim.player, gd, true);
                    if (r) return r;
                }
                else if (claim.type === 'chi') {
                    h.fulou_chi(claim.tiles[0], claim.tiles[1], p, turn);
                    this.log_action(claim.player, '吃', p);
                }
                turn      = claim.player;
                need_draw = false;
                continue;
            }

            turn      = (turn + 1) % 4;
            need_draw = true;
        }
    }

    /* ---------- 宣言 ---------- */

    _claim(from, p) {
        const policy = this._policy;
        const others = [1, 2, 3].map(i => (from + i) % 4);

        /* 1. 荣和优先，一炮一响 */
        const rong = this._claim_rong(from, p);
        if (rong != null) return { type: 'hu', player: rong };

        /* 2. 碰 / 明杠 */
        for (const l of others) {
            const hand = this._hands[l];
            if (hand.can_gang(p) && (! policy.gang || policy.gang(hand, p, this._ctx(l))))
                return { type: 'gang', player: l };
            if (hand.can_pon(p) && (! policy.pon || policy.pon(hand, p, this._ctx(l))))
                return { type: 'pon', player: l };
        }

        /* 3. 吃：只有下家能吃上家打出的牌 */
        const l = others[0];
        const hand = this._hands[l];
        const opts = hand.chi_options(p);
        if (opts.length && policy.chi) {
            const pick = policy.chi(hand, opts, p, this._ctx(l));
            if (pick) return { type: 'chi', player: l, tiles: pick };
        }

        return null;
    }

    /* 一炮一响：按逆时针顺序找第一个能和的人 */
    _claim_rong(from, p) {
        for (let i = 1; i <= 3; i++) {
            const l = (from + i) % 4;
            const hand = this._hands[l];
            if (! hand.hu(p)) continue;
            if (this._policy.hu_rong
                    && ! this._policy.hu_rong(hand, p, this._ctx(l))) continue;
            return l;
        }
        return null;
    }

    /* ---------- 和了 ---------- */

    _try_zimo(player, drawn, gangshang) {
        const hand = this._hands[player];
        if (! hand.hu()) return null;
        if (this._policy.hu_zimo
                && ! this._policy.hu_zimo(hand, this._ctx(player))) return null;
        return this._hule(player, { zimo: true, drawn, gangshang });
    }

    _to_score_mianzi(m) {
        const real = m.filter(t => t !== '*');
        const n_joker = m.length - real.length;
        if (real.length === 0) return { kind: 'kezi', tile: '*', n_joker: 3 };
        const same = real.every(t => t === real[0]);
        return { kind: same ? 'kezi' : 'shunzi', tile: real[0], n_joker };
    }

    _hule(player, opts = {}) {
        const hand = this._hands[player];
        const res  = hand.hu(opts.win_tile);
        if (! res) throw new Error('和牌判定失败');

        const mianzi = res.mianzi.map(m => this._to_score_mianzi(m));
        for (const f of hand.fulou) {
            mianzi.push({
                kind:    f.kind === 'chi' ? 'shunzi' : (f.kind === 'pon' ? 'kezi' : 'gang'),
                tile:    f.tile,
                fulou:   f.kind !== 'angang',
                angang:  f.kind === 'angang',
                n_joker: 0,
            });
        }

        const real = res.pair.filter(t => t !== '*');
        const pair = { tile: real[0] || '*', n_joker: res.pair.length - real.length };

        const win_tile = opts.zimo ? opts.drawn : opts.win_tile;

        const ctx = {
            mianzi, pair,
            flowers:  hand.flowers,
            jokers:   hand.jokers,
            seat:     this.menfeng(player),
            zimo:     !!opts.zimo,
            win_by_joker: win_tile === this._joker,
            guiwei:   false,
            gangshang: !!opts.gangshang,
            qianggang: !!opts.qianggang,
            nao:      this._nao,
            joker:    this._joker,
            rule:     this._rule,
        };

        const r = Score.score(ctx);

        const players = this._hands.map((h, i) => ({
            seat:      this.menfeng(i),
            is_winner: i === player,
            base:      i === player ? r.base : Score.hutou_of_hand(h, this._rule),
            defen:     i === player ? r.defen : 0,
        }));
        const delta = Score.settle(players);
        for (let i = 0; i < 4; i++) this._score[i] += delta[i];

        this.log_action(player, '和牌',
            `${opts.zimo ? '自摸' : '荣和'} ${r.hutou} 胡 × 2^${r.tai} = ${r.defen}`
            + (r.lazi_hit ? `（腊子：${r.lazi.join('/')}）` : ''));

        this._zhuang = this._rule['连庄方式'] === 1 && player === this._zhuang
                     ? this._zhuang : (this._zhuang + 1) % 4;

        return { type: 'hule', winner: player, zimo: !!opts.zimo, win_tile,
                 score: r, delta, menfeng: this.menfeng(player), nao: this._nao };
    }

    /* ---------- 流局 ---------- */

    _pingju() {
        const players = this._hands.map((h, i) => ({
            seat: this.menfeng(i), is_winner: false,
            base: Score.hutou_of_hand(h, this._rule), defen: 0,
        }));
        const delta = Score.settle(players);
        for (let i = 0; i < 4; i++) this._score[i] += delta[i];

        this.log_action(null, '流局', `牌墙剩 ${this._shan.paishu} 张`);
        this._zhuang = (this._zhuang + 1) % 4;      // 流局下庄

        return { type: 'pingju', delta, reason: '牌墙剩 8 墩' };
    }
}

module.exports = Game;
