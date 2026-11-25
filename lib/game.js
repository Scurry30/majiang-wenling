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
const { hule, is_double_joker_pair } = require('./hule');

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

        this._jushu    = opts.jushu    ?? 0;   // 局数（0 = 东一局）
        this._changbang = opts.changbang ?? 0;  // 本场（连庄累加）
    }

    get zhuang() { return this._zhuang }
    get score()  { return this._score }
    get log()    { return this._log }
    get shan()   { return this._shan }
    get nao()    { return this._nao }
    get hands()  { return this._hands }
    get he()     { return this._he }
    get jushu()  { return this._jushu }
    get changbang() { return this._changbang }

    /* 东一局 / 南二局 … */
    jushu_name() { return this.jushu_name_at(this._jushu) }

    jushu_name_at(j) {
        const feng = ['东', '南', '西', '北'][Math.floor(j / 4) % 4];
        const ju   = ['一', '二', '三', '四'][j % 4];
        return `${feng}${ju}局`;
    }

    /* 本局开始时的局数（打完后 _jushu 会推进） */
    get start_jushu() { return this._start_jushu ?? this._jushu }

    menfeng(player) { return (player - this._zhuang + 4) % 4 }
    seat_name(player) { return SEAT_NAME[this.menfeng(player)] }

    log_action(player, action, detail = '') {
        const rec = { player, action, detail };
        this._log.push(rec);
        this._on_log && this._on_log(rec);
        this._on_update && this._on_update(this);
    }

    /* ---------- 开局 ---------- */

    kaiju() {
        const { shan, qipai, flowers, baiban, joker, indicator }
            = Shan.qipai(this._rule, this._seed, this._zhuang);
        this._shan      = shan;
        this._joker     = joker;
        this._indicator = indicator;
        this._hands     = qipai.map(hand => Shoupai.from(hand, this._rule, joker));
        flowers.forEach((fs, i) => fs.forEach(f => this._hands[i].add_flower(f)));
        (baiban || []).forEach((bs, i) => bs.forEach(p => this._hands[i].add_baiban(p)));

        this._nao  = ['z5', 'z6', 'z7'].includes(joker) || Pai.is_flower(joker);
        this._turn = this._zhuang;
        this._start_jushu = this._jushu;

        this.log_action(null, '开局',
            `财神 ${joker}${this._nao ? '（闹闹）' : ''}，牌墙 ${shan.paishu} 张`);
        return this;
    }

    /* ---------- 摸牌 ---------- */

    /* 白板当花；红中当财神时，发也当花 */
    _is_baiban(p) {
        if (! this._rule['白板当花']) return false;
        if (p === 'z5') return this._joker !== 'z5';
        if (p === 'z6') return this._rule['发当花'] && this._joker === 'z7';
        return false;
    }

    _draw(turn) {
        let p = this._shan.zimo();
        while (Pai.is_flower(p) || this._is_baiban(p)) {
            if (Pai.is_flower(p)) {
                this._hands[turn].add_flower(p);
                this.log_action(turn, '补花', Pai.FLOWER_NAME[p]);
            }
            else {
                this._hands[turn].add_baiban(p);
                this.log_action(turn, '白板补牌', '白板');
            }
            p = this._shan.buhua();
        }
        this._hands[turn].add(p);
        return p;
    }

    _draw_gang(turn) {
        let p = this._shan.zimo();
        while (Pai.is_flower(p) || this._is_baiban(p)) {
            if (Pai.is_flower(p)) {
                this._hands[turn].add_flower(p);
                this.log_action(turn, '补花', Pai.FLOWER_NAME[p]);
            }
            else {
                this._hands[turn].add_baiban(p);
                this.log_action(turn, '白板补牌', '白板');
            }
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

    /* ---------- 主循环（异步：策略可以返回 Promise，等玩家点击） ---------- */

    async run() {
        if (! this._hands.length) this.kaiju();

        let turn      = this._turn;
        /* 庄家配牌时已经多摸了一张（17 张），第一手直接打牌，不能再摸 */
        let need_draw = false;

        for (;;) {

            if (need_draw) {
                if (this._exhausted()) return this._pingju();

                let drawn = this._draw(turn);
                let res   = await this._try_zimo(turn, drawn, false);
                if (res) return res;

                /* 暗杠 / 加杠 */
                const g = this._policy.self_gang
                        ? await this._policy.self_gang(this._hands[turn], this._ctx(turn)) : null;
                if (g) {
                    const hand = this._hands[turn];
                    const tile = g.tile;

                    if (g.type === 'kakan') {
                        /* 抢杠：别人可以荣和这张加杠的牌 */
                        const rong = await this._claim_rong(turn, tile);
                        if (rong != null) return this._hule(rong, { win_tile: tile, qianggang: true });
                        hand.kakan(tile);
                    }
                    else {
                        hand.angang(tile);
                    }

                    const gd = this._draw_gang(turn);
                    /* 补完牌再记日志：快照要包含补进来的那张，否则回放会少一张 */
                    this.log_action(turn, g.type === 'kakan' ? '加杠' : '暗杠', tile);
                    res = await this._try_zimo(turn, gd, true);      // 杠上开花
                    if (res) return res;
                }
            }

            /* 打牌 */
            const hand = this._hands[turn];
            const p    = this._policy.dapai
                       ? await this._policy.dapai(hand, this._ctx(turn))
                       : hand.dapai_list[0];
            hand.remove(p);
            hand.set_kuikae(null);                  // 打完这张，食替限制解除
            this._he[turn].push(p);
            this.log_action(turn, '打', p);

            /* 宣言 */
            const claim = await this._claim(turn, p);
            if (claim) {
                if (claim.type === 'hu') return this._hule(claim.player, { win_tile: p });

                const h = this._hands[claim.player];
                if (claim.type === 'pon') {
                    h.fulou_pon(p, turn);
                    this.log_action(claim.player, '碰', p);
                }
                else if (claim.type === 'gang') {
                    h.fulou_gang(p, turn);
                    const gd = this._draw_gang(claim.player);
                    /* 先补牌再记日志，快照才完整 */
                    this.log_action(claim.player, '杠', p);
                    const r  = await this._try_zimo(claim.player, gd, true);
                    if (r) return r;
                }
                else if (claim.type === 'chi') {
                    h.fulou_chi(claim.tiles[0], claim.tiles[1], p, turn);
                    if (this._rule['食替限制']) h.set_kuikae(p);
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

    async _claim(from, p) {
        const policy = this._policy;
        const others = [1, 2, 3].map(i => (from + i) % 4);

        /* 1. 荣和优先，一炮一响 */
        const rong = await this._claim_rong(from, p);
        if (rong != null) return { type: 'hu', player: rong };

        /* 2. 碰 / 明杠 */
        for (const l of others) {
            const hand = this._hands[l];
            if (hand.can_gang(p) && (! policy.gang || await policy.gang(hand, p, this._ctx(l))))
                return { type: 'gang', player: l };
            if (hand.can_pon(p) && (! policy.pon || await policy.pon(hand, p, this._ctx(l))))
                return { type: 'pon', player: l };
        }

        /* 3. 吃：只有下家能吃上家打出的牌 */
        const l = others[0];
        const hand = this._hands[l];
        const opts = hand.chi_options(p);
        if (opts.length && policy.chi) {
            const pick = await policy.chi(hand, opts, p, this._ctx(l));
            if (pick) return { type: 'chi', player: l, tiles: pick };
        }

        return null;
    }

    /* 一炮一响：按逆时针顺序找第一个能和的人 */
    async _claim_rong(from, p) {
        for (let i = 1; i <= 3; i++) {
            const l = (from + i) % 4;
            const hand = this._hands[l];
            if (! hand.hu(p)) continue;
            if (this._policy.hu_rong
                    && ! await this._policy.hu_rong(hand, p, this._ctx(l))) continue;
            return l;
        }
        return null;
    }

    /* ---------- 和了 ---------- */

    async _try_zimo(player, drawn, gangshang) {
        const hand = this._hands[player];
        if (! hand.hu()) return null;
        if (this._policy.hu_zimo
                && ! await this._policy.hu_zimo(hand, this._ctx(player))) return null;
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

        /* 财神归位：把财神当它本来的牌种，手牌本身就能和（不需要它当万能牌） */
        let guiwei = false;
        if (hand.jokers > 0 && this._joker && ! Pai.is_flower(this._joker)) {
            const pai = opts.zimo ? hand.pai.slice()
                                  : hand.pai.concat([opts.win_tile]);
            try { guiwei = !! hule(pai, undefined, hand.fulou.length) }
            catch (e) { guiwei = false }
        }

        /* 两个财神作将（脚） */
        let double_joker_pair = false;
        if (hand.jokers >= 2 && this._joker && ! Pai.is_flower(this._joker)) {
            const pai = opts.zimo ? hand.pai.slice()
                                  : hand.pai.concat([opts.win_tile]);
            try {
                double_joker_pair = is_double_joker_pair(pai, this._joker, hand.fulou.length);
            }
            catch (e) { double_joker_pair = false }
        }

        /* 两张财神都当将时，不算「归位」（归位指财神当自己那张牌进面子） */
        if (double_joker_pair && hand.jokers === 2) guiwei = false;

        const seat = this.menfeng(player);      // 和牌时的自风（庄家随后会轮转，必须先记下来）

        const ctx = {
            mianzi, pair,
            flowers:  hand.flowers,
            baiban:   hand.baiban.slice(),
            jokers:   hand.jokers,
            seat,
            zimo:     !!opts.zimo,
            win_by_joker: win_tile === this._joker,
            guiwei,
            double_joker_pair,
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

        /* 连庄/轮转：庄家和牌连庄（本场 +1），闲家和牌轮转（本场清零） */
        const zhuang_at_win = this._zhuang;
        if (this._rule['连庄方式'] === 1 && player === this._zhuang) {
            this._changbang++;
        }
        else {
            this._zhuang    = (this._zhuang + 1) % 4;
            this._jushu++;
            this._changbang = 0;
        }

        return { type: 'hule', winner: player, zimo: !!opts.zimo, win_tile,
                 score: r, delta, menfeng: seat, zhuang: zhuang_at_win,
                 nao: this._nao };
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

        /* 流局（黄牌）：庄家继续连庄，本场 +1，局数不变 */
        if (this._rule['流局连庄'] !== false) {
            this._changbang++;
        }
        else {
            this._zhuang    = (this._zhuang + 1) % 4;
            this._jushu++;
            this._changbang = 0;
        }

        return { type: 'pingju', delta, reason: '牌墙剩 8 墩' };
    }
}

module.exports = Game;
