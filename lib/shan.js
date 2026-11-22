/*
 *  MajiangWenling.Shan —— 牌山、配牌、财神、补花
 *
 *  144 张：万筒条 1-9 各 4 张（108）+ 东南西北白发中 各 4 张（28）+ 花牌 8 张（8）
 *
 *  开牌流程（按温岭规则）：
 *    1. 四家轮流各抓 16 张
 *    2. 庄家再抓 1 张（共 17）
 *    3. 庄家第 17 张紧挨着的下一张翻开 → 取出作财神指示牌
 *    4. 同种剩余 3 张为财神（万能牌）
 *    5. 各家补花：手上有花牌就从牌墙尾部补，直到手上没有花牌
 */
"use strict";

const Pai = require('./pai');

const SUITS   = ['m', 'p', 's'];
const HONORS  = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'];
const FLOWERS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];

// 可复现的随机数（同一 seed 出同一局牌，便于调试和回归）
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function build() {
    const pai = [];
    for (const s of SUITS) {
        for (let n = 1; n <= 9; n++) {
            for (let i = 0; i < 4; i++) pai.push(s + n);
        }
    }
    for (const z of HONORS) {
        for (let i = 0; i < 4; i++) pai.push(z);
    }
    for (const f of FLOWERS) pai.push(f);      // 花牌各 1 张
    return pai;
}

class Shan {

    constructor(rule, seed) {
        this._rule = rule;
        this._pai  = build();
        const rand = seed == null ? Math.random : mulberry32(seed);
        for (let i = this._pai.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [this._pai[i], this._pai[j]] = [this._pai[j], this._pai[i]];
        }
        this._head = 0;
        this._tail = this._pai.length - 1;
        this._indicator = null;
        this._joker     = null;
    }

    /* 牌墙剩余张数 */
    get paishu() { return this._tail - this._head + 1 }
    /* 剩余墩数（2 张 1 墩） */
    get dun()    { return Math.floor(this.paishu / 2) }
    /* 是否已到流局线 */
    get exhausted() { return this.dun < this._rule['流局剩余墩'] }

    get indicator() { return this._indicator }
    get joker()     { return this._joker }

    /* 正常摸牌：牌墙头部 */
    zimo() {
        if (this._head > this._tail) throw new Error('牌墙已空');
        return this._pai[this._head++];
    }

    /* 补花：牌墙尾部 */
    buhua() {
        if (this._head > this._tail) throw new Error('牌墙已空');
        return this._pai[this._tail--];
    }

    /* 杠后补牌：从牌墙头部（与正常摸牌同侧） */
    gangzimo() { return this.zimo() }

    /* 翻财神：取出庄家第 17 张的下一张作指示牌 */
    flips_joker() {
        this._indicator = this.zimo();
        this._joker     = this._indicator;   // 财神种 = 指示牌；同种剩余 3 张为万能牌
        return this._joker;
    }

    /* 财神在牌墙/手牌里的实际可用张数（指示牌已取出，所以最多 3 张） */
    get joker_remain() {
        if (! this._joker) return 0;
        let n = 0;
        for (let i = this._head; i <= this._tail; i++) if (this._pai[i] === this._joker) n++;
        return n;
    }
}

/**
 * 配牌：抓 16 张 → 庄家第 17 张 → 翻财神 → 补花
 * @returns {{shan, qipai, flowers, joker, indicator, dealer}}
 */
function qipai(rule, seed) {

    const shan = new Shan(rule, seed);
    const hand = [[], [], [], []];

    for (let i = 0; i < 16 * 4; i++) hand[i % 4].push(shan.zimo());
    hand[0].push(shan.zimo());              // 庄家第 17 张

    const joker = shan.flips_joker();

    /* 补花：手上每有一张花牌，就从牌墙尾部补一张；补到的还是花就继续补 */
    const flowers = [[], [], [], []];
    for (let l = 0; l < 4; l++) {
        for (;;) {
            const i = hand[l].findIndex(p => Pai.is_flower(p));
            if (i < 0) break;
            flowers[l].push(hand[l].splice(i, 1)[0]);
            let p = shan.buhua();
            while (Pai.is_flower(p)) {
                flowers[l].push(p);
                p = shan.buhua();
            }
            hand[l].push(p);
        }
    }

    return { shan, qipai: hand.map(Pai.sort), flowers, joker, indicator: shan.indicator, dealer: 0 };
}

module.exports = { Shan, qipai, build, mulberry32, FLOWERS };
