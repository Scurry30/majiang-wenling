/*
 *  MajiangWenling.Shoupai —— 手牌 + 副露
 *
 *  温岭没有门清概念，手牌就是「暗牌 + 副露」，花牌单独放在一边。
 *  财神（joker 牌种）留在 _pai 里，但任何判定都把它当万能牌，不落到牌种计数。
 */
"use strict";

const Pai = require('./pai');
const { hule } = require('./hule');

const IDX = Pai.KIND_INDEX;

class Shoupai {

    constructor(rule, joker) {
        this._rule   = rule;
        this._joker  = joker;
        this._pai    = [];      // 暗牌（含财神）
        this._fulou  = [];      // 副露
        this._flowers = [];     // 花牌
        this._baiban  = [];     // 白板（当花用）
        this._kuikae  = null;   // 食替：刚吃进、这轮不能打的牌
    }

    static from(tiles, rule, joker) {
        const s = new Shoupai(rule, joker);
        for (const p of tiles) s.add(p);
        return s;
    }

    clone() {
        const s = new Shoupai(this._rule, this._joker);
        s._pai     = this._pai.slice();
        s._fulou   = this._fulou.map(m => Object.assign({}, m, { tiles: m.tiles.slice() }));
        s._flowers = this._flowers.slice();
        s._baiban  = this._baiban.slice();
        s._kuikae  = this._kuikae;
        return s;
    }

    get pai()       { return this._pai      }
    get fulou()     { return this._fulou    }
    get flowers()   { return this._flowers  }
    get baiban()    { return this._baiban   }
    get shoupaishu() { return this._pai.length }
    get jokers()    { return this._pai.filter(p => p === this._joker).length }

    add(p)    { this._pai.push(p);                    return this }
    remove(p) {
        const i = this._pai.indexOf(p);
        if (i < 0) throw new Error(`手里没有 ${p}`);
        this._pai.splice(i, 1);
        return this;
    }
    add_flower(f) { this._flowers.push(f); return this }
    add_baiban(p) { this._baiban.push(p);  return this }

    /* 34 格计数（不含财神） */
    counts() {
        const c = new Array(34).fill(0);
        for (const p of this._pai) {
            if (p === this._joker) continue;
            c[IDX.get(p)]++;
        }
        return c;
    }

    count(p) {
        if (p === this._joker) return 0;        // 财神不参与吃碰杠
        let n = 0;
        for (const q of this._pai) if (q === p) n++;
        return n;
    }

    /* 可打出的牌（去重）。吃牌后不能马上打刚吃进的那张（食替） */
    get dapai_list() {
        const list = [...new Set(this._pai)];
        if (this._kuikae) {
            const filtered = list.filter(p => p !== this._kuikae);
            if (filtered.length) return filtered;
        }
        return list;
    }

    set_kuikae(p) { this._kuikae = p; return this }
    get kuikae()  { return this._kuikae }

    /* 和牌判定：tile 为和牌张（自摸时传摸到的牌，荣和时传别人打出的牌） */
    hu(tile) {
        const pai = tile ? this._pai.concat([tile]) : this._pai;
        if (pai.length !== (5 - this._fulou.length) * 3 + 2) return null;
        return hule(pai, this._joker, this._fulou.length);
    }

    /* 听牌表：返回能和的牌种 */
    tingpai() {
        const need = (5 - this._fulou.length) * 3 + 2;
        if (this._pai.length + 1 !== need) return [];
        const rv = [];
        for (const k of Pai.KINDS) {
            if (this.hu(k)) rv.push(k);
        }
        return rv;
    }

    /* 吃：返回可选的搭子（仅数牌，且不含财神） */
    chi_options(p) {
        if (p === this._joker || !Pai.is_simple(p) && !Pai.is_terminal(p)) return [];
        if (!'mps'.includes(p[0])) return [];
        const n = +p[1];
        const cand = [];
        if (n >= 3) cand.push([Pai.suit(p) + (n - 2), Pai.suit(p) + (n - 1)]);
        if (n >= 2 && n <= 8) cand.push([Pai.suit(p) + (n - 1), Pai.suit(p) + (n + 1)]);
        if (n <= 7) cand.push([Pai.suit(p) + (n + 1), Pai.suit(p) + (n + 2)]);
        return cand.filter(([a, b]) => this.count(a) > 0 && this.count(b) > 0);
    }

    can_pon(p)  { return p !== this._joker && this.count(p) >= 2 }
    can_gang(p) { return p !== this._joker && this.count(p) >= 3 }

    /* 暗杠候选：手里 4 张（财神不算） */
    angang_options() {
        const c = this.counts();
        return Pai.KINDS.filter((k, i) => c[i] === 4);
    }

    /* 加杠候选：已碰的刻子 + 手里还有 1 张 */
    kakan_options() {
        return this._fulou
            .filter(m => m.kind === 'pon' && this.count(m.tile) >= 1)
            .map(m => m.tile);
    }

    /* 副露 */
    fulou_chi(a, b, p, from) {
        this.remove(a); this.remove(b);
        this._fulou.push({ kind: 'chi', tile: p, tiles: [a, b, p].sort(Pai.sort_key), from });
        return this;
    }
    fulou_pon(p, from) {
        this.remove(p); this.remove(p);
        this._fulou.push({ kind: 'pon', tile: p, tiles: [p, p, p], from });
        return this;
    }
    fulou_gang(p, from) {
        for (let i = 0; i < 3; i++) this.remove(p);
        this._fulou.push({ kind: 'gang', tile: p, tiles: [p, p, p, p], from });
        return this;
    }
    angang(p) {
        for (let i = 0; i < 4; i++) this.remove(p);
        this._fulou.push({ kind: 'angang', tile: p, tiles: [p, p, p, p] });
        return this;
    }
    kakan(p) {
        this.remove(p);
        const m = this._fulou.find(m => m.kind === 'pon' && m.tile === p);
        m.kind = 'kakan';
        m.tiles = [p, p, p, p];
        return this;
    }
}

module.exports = Shoupai;
