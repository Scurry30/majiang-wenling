/*
 *  命令行对局：四个随机策略的机器人打一局，打印全过程。
 *  用法: node dev/play.js [seed] [--quiet]
 */
"use strict";

const Wenling = require('../lib');
const Game    = require('../lib/game');
const Pai     = Wenling.Pai;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function random_policy(seed) {
    const rnd = mulberry32(seed);
    return {
        dapai(hand) {
            const list = hand.dapai_list;
            return list[Math.floor(rnd() * list.length)];
        },
        hu_zimo()  { return true },
        hu_rong()  { return true },
        pon()      { return rnd() < 0.35 },
        gang()     { return rnd() < 0.5  },
        chi(hand, options) { return rnd() < 0.25 ? options[0] : null },
        self_gang(hand) {
            const a = hand.angang_options();
            const k = hand.kakan_options();
            if (a.length && rnd() < 0.15) return { type: 'angang', tile: a[0] };
            if (k.length && rnd() < 0.15) return { type: 'kakan',  tile: k[0] };
            return null;
        },
    };
}

function fmt(hand) {
    const g = { m: '', p: '', s: '', z: '' };
    for (const p of hand.pai) { if (p[0] !== 'f') g[p[0]] += p[1] }
    const s = Object.entries(g).filter(([, v]) => v).map(([k, v]) => k + v).join(' ');
    const f = hand.flowers.length ? `  花:${hand.flowers.map(x => Pai.FLOWER_NAME[x]).join('')}` : '';
    const m = hand.fulou.length ? `  副露:${hand.fulou.map(x => x.tiles.join('')).join(' ')}` : '';
    return s + f + m;
}

(async () => {
    const seed  = process.argv[2] ? +process.argv[2] : 20261123;
    const quiet = process.argv.includes('--quiet');

    const rule = Wenling.rule();
    const game = new Game(rule, random_policy(seed), { seed });

    if (! quiet) {
        game._on_log = rec => {
            const who = rec.player == null ? '  ' : `P${rec.player}`;
            console.log(`${who} ${rec.action} ${rec.detail}`);
        };
    }

    game.kaiju();

    if (! quiet) {
        console.log(`\n财神: ${game.shan.joker}   牌墙: ${game.shan.paishu} 张\n`);
        for (let i = 0; i < 4; i++) {
            console.log(`P${i}(${game.seat_name(i)}) ${fmt(game.hands[i])}`);
        }
        console.log('');
    }

    const result = await game.run();

    console.log('\n=== 结果 ===');
    if (result.type === 'hule') {
        console.log(`P${result.winner}(${['东','南','西','北'][result.menfeng]}) ${result.zimo ? '自摸' : '荣和'}`);
        console.log(`台数明细: ${result.score.tai_list.map(t => `${t.name}${t.tai}`).join(' ') || '无'}`);
        console.log(`胡头 ${result.score.hutou} × 2^${result.score.tai} = ${result.score.defen}`);
        if (result.score.lazi.length) console.log(`腊子: ${result.score.lazi.join('/')}`);
    }
    else {
        console.log('流局');
    }
    console.log(`收支: ${result.delta.map((d, i) => `P${i}:${d >= 0 ? '+' : ''}${d}`).join('  ')}`);
    console.log(`累计: ${game.score.map((d, i) => `P${i}:${d >= 0 ? '+' : ''}${d}`).join('  ')}`);
    console.log(`（庄家下一局: P${game.zhuang}）`);
})();
