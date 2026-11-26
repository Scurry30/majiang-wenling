/*
 *  规则细节自检：食替、财神归位、局数/本场、吃牌方向。
 *    node dev/rules-test.js
 */
"use strict";

const Wenling = require('../lib');
const Game    = require('../lib/game');
const Shoupai = require('../lib/shoupai');
const Score   = require('../lib/score');

const rule = Wenling.rule();
const J = 'f1';        // 不存在的财神种 = 没有财神

function parse(s) {
    const rv = [];
    let suit = null;
    for (const ch of s.replace(/[\s,]/g, '')) {
        if ('mpsz'.includes(ch)) suit = ch;
        else rv.push(suit + ch);
    }
    return rv;
}

let fail = 0;
function eq(name, got, want) {
    const ok = got === want;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${got}${ok ? '' : `（期望 ${want}）`}`);
    if (!ok) fail++;
}
function ok(name, cond, extra = '') {
    console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + extra}`);
    if (!cond) fail++;
}

const HAND = 'm1 m2 p1 p2 p3 s1 s2 s3 z1 z2 z5 z6 m5 m6 m7 m8';

(async () => {

    /* ---------- 1. 食替 ---------- */
    console.log('--- 食替（吃后不能立刻打刚吃进的牌）---');
    {
        const s = Shoupai.from(parse('m1 m2 m3 m5 p1 p2 p3 p4 s1 s2 s3 z1 z2 z5 m9'), rule, J);
        s.fulou_chi('m1', 'm2', 'm3', 3);
        s.set_kuikae('m3');
        ok('刚吃的 m3 不能打', ! s.dapai_list.includes('m3'), s.dapai_list.join(','));
        ok('其余牌照常能打', s.dapai_list.includes('m5'));

        s.set_kuikae(null);
        ok('解除限制后 m3 可以打', s.dapai_list.includes('m3'));
    }

    /* ---------- 2. 财神归位 ---------- */
    console.log('\n--- 财神归位 ---');
    {
        const game = new Game(rule, {}, { seed: 1 });
        game.kaiju();
        game._joker  = 'p6';       // 财神种
        game._zhuang = 0;
        /* p6 就在 p456 这个顺子里，不需要它当万能牌 */
        game._hands[0] = Shoupai.from(parse('m123 m456 m789 p456 p789 z1'), rule, 'p6');
        const r = game._hule(0, { win_tile: 'z1' });
        const names = r.score.tai_list.map(t => t.name);
        ok('识别为财神归位', names.includes('财神归位'), names.join(','));
        eq('归位加 1 台', r.score.tai_list.find(t => t.name === '财神归位').tai, rule['财神归位台']);
    }

    /* ---------- 3. 局数 / 本场 ---------- */
    console.log('\n--- 局数 / 本场 ---');
    {
        const g1 = new Game(rule, {}, { seed: 2 });
        g1.kaiju();
        g1._zhuang = 0;
        g1._hands[0] = Shoupai.from(parse('m123 m456 m789 p456 p789 z1'), rule, J);
        g1._hule(0, { win_tile: 'z1' });
        eq('庄家和牌后仍是庄', g1.zhuang, 0);
        eq('本场 +1', g1.changbang, 1);
        eq('局数不变', g1.jushu, 0);

        const g2 = new Game(rule, {}, { seed: 3 });
        g2.kaiju();
        g2._zhuang = 0;
        g2._hands[1] = Shoupai.from(parse('m123 m456 m789 p456 p789 z1'), rule, J);
        g2._hule(1, { win_tile: 'z1' });
        eq('闲家和牌后庄家轮转', g2.zhuang, 1);
        eq('局数 +1', g2.jushu, 1);
        eq('本场清零', g2.changbang, 0);

        const g3 = new Game(rule, {}, { seed: 4 });
        g3.kaiju();
        g3._zhuang = 0;
        g3._jushu  = 2;
        g3._pingju();
        eq('流局庄家连庄', g3.zhuang, 0);
        eq('流局局数不变', g3.jushu, 2);
        eq('流局本场 +1', g3.changbang, 1);
        eq('局名', g3.jushu_name(), '东三局');
    }

    /* ---------- 4. 吃牌方向 ---------- */
    console.log('\n--- 吃牌方向（吃上家）---');
    {
        const g = new Game(rule, { chi: (h, o) => o[0] }, { seed: 5 });
        g.kaiju();
        g._hands[0] = Shoupai.from(parse(HAND), rule, J);   // P3 的下家
        g._hands[1] = Shoupai.from(parse(HAND), rule, J);
        g._hands[2] = Shoupai.from(parse(HAND), rule, J);   // 不是下家，不该被问

        const opts0 = g._hands[0].chi_options('m3');
        ok('P0 有 m3 的吃法', opts0.length > 0, JSON.stringify(opts0));

        const claim = await g._claim(3, 'm3');
        eq('吃牌的只能是打牌者的下家（P0）', claim && claim.player, 0);
        eq('宣言类型是吃', claim && claim.type, 'chi');
    }

    /* ---------- 5. 腊子只看自己收的花 ---------- */
    console.log('\n--- 腊子：一家同时拥有才成立 ---');
    {
        const base = {
            mianzi: [{ kind: 'shunzi', tile: 'm1', n_joker: 0 }],
            pair:  { tile: 'm9', n_joker: 0 },
            jokers: 0, seat: 0, zimo: false, rule,
        };

        const r1 = Score.score({ ...base, flowers: ['f5', 'f6', 'f7', 'f8'] });
        eq('自己集齐四季花（春夏秋冬）→ 四红花', r1.lazi.join(','), '四红花');
        eq('腊子按封顶算', r1.defen, rule['腊子封顶']);

        const r2 = Score.score({ ...base, flowers: ['f1', 'f2', 'f3', 'f4'] });
        eq('自己集齐四君子（梅兰竹菊）→ 四黑花', r2.lazi.join(','), '四黑花');

        const r3 = Score.score({ ...base, flowers: ['f5', 'f6', 'f7'] });
        eq('只有 3 张红花 → 不是腊子', r3.lazi.length, 0);

        const r4 = Score.score({ ...base, flowers: ['f5', 'f6', 'f1', 'f2'] });
        eq('红黑各 2 张 → 不是腊子', r4.lazi.length, 0);

        const r5 = Score.score({ ...base, flowers: ['f5', 'f5'] });
        eq('重复花牌不重复计（实际不会出现）', r5.lazi.length, 0);
    }

    /* ---------- 6. 白板当花：每张 1 台 ---------- */
    console.log('\n--- 白板当花 ---');
    {
        const base = {
            mianzi: [{ kind: 'shunzi', tile: 'm1', n_joker: 0 }],
            pair:  { tile: 'm9', n_joker: 0 },
            jokers: 0, seat: 0, zimo: false, rule,
        };

        const r1 = Score.score({ ...base, flowers: [], baiban: ['z5', 'z5'] });
        const t  = r1.tai_list.find(x => x.name === '白板');
        ok('两张白板计 2 台', !! t && t.tai === 2, JSON.stringify(r1.tai_list));

        const r2 = Score.score({ ...base, flowers: [], baiban: [] });
        eq('没有白板就不计这台', r2.tai_list.some(x => x.name === '白板'), false);

        const r3 = Score.score({ ...base, flowers: [], baiban: ['z5', 'z5', 'z5', 'z5'] });
        ok('集齐 4 张白板 → 腊子', r3.lazi.includes('四白板'), r3.lazi.join(','));
        eq('四白板按封顶算', r3.defen, rule['腊子封顶']);

        const r4 = Score.score({ ...base, flowers: [], baiban: ['z5', 'z5', 'z5'] });
        eq('只有 3 张白板 → 不是腊子', r4.lazi.length, 0);
    }

    /* ---------- 7. 碰中发 +1 台 / 字牌暗杠才是腊子 ---------- */
    console.log('\n--- 碰中发 / 字牌暗杠 ---');
    {
        const shunzi = (t) => ({ kind: 'shunzi', tile: t, n_joker: 0 });
        const base = {
            mianzi: [shunzi('m1'), shunzi('m4')],
            pair:  { tile: 'm9', n_joker: 0 },
            jokers: 0, seat: 0, zimo: false, rule,
        };

        /* 碰中：明刻 z7 */
        const pon = (t, angang = false) => ({ kind: 'gang', tile: t, angang, fulou: ! angang, n_joker: 0 });
        const kezi = (t) => ({ kind: 'kezi', tile: t, fulou: true, n_joker: 0 });

        let r = Score.score({ ...base, mianzi: [...base.mianzi, kezi('z7')] });
        const t1 = r.tai_list.find(x => x.name === '碰中发');
        ok('碰中计 1 台', !! t1 && t1.tai === 1, JSON.stringify(r.tai_list));

        r = Score.score({ ...base, mianzi: [...base.mianzi, kezi('z6'), kezi('z7')] });
        const t2 = r.tai_list.find(x => x.name === '碰中发');
        ok('碰发 + 碰中共 2 台', !! t2 && t2.tai === 2, JSON.stringify(r.tai_list));

        /* 暗杠中 → 腊子；明杠/补杠不算 */
        const angang = { kind: 'gang', tile: 'z7', angang: true, fulou: false, n_joker: 0 };
        r = Score.score({ ...base, mianzi: [...base.mianzi, angang] });
        ok('暗杠中 → 腊子', r.lazi.includes('字牌暗杠'), r.lazi.join(','));

        const minggang = { kind: 'gang', tile: 'z7', angang: false, fulou: true, n_joker: 0 };
        r = Score.score({ ...base, mianzi: [...base.mianzi, minggang] });
        eq('明杠中不算腊子', r.lazi.length, 0);
        eq('明杠中按明杠硬张计 16 胡',
           Score.mianzi_hutou(minggang, rule), 16 );

        const kakan = { kind: 'gang', tile: 'z7', angang: false, fulou: true, n_joker: 0 };
        r = Score.score({ ...base, mianzi: [...base.mianzi, kakan] });
        eq('补杠中不算腊子', r.lazi.length, 0);

        /* 门风暗杠（东家杠东） */
        r = Score.score({ ...base, mianzi: [...base.mianzi, { kind: 'gang', tile: 'z1', angang: true, n_joker: 0 }] });
        ok('门风暗杠 → 腊子', r.lazi.includes('字牌暗杠'), r.lazi.join(','));

        /* 闲家杠东（不是自己门风）不算 */
        r = Score.score({ ...base, seat: 2, mianzi: [...base.mianzi, { kind: 'gang', tile: 'z1', angang: true, n_joker: 0 }] });
        eq('非门风的暗杠不算腊子', r.lazi.length, 0);
    }

    /* ---------- 8. 财神归位 / 双财神作将 ---------- */
    console.log('\n--- 财神归位 / 双财神作将 ---');
    {
        const H = require('../lib/hule');

        /* 5 组面子 + 两张财神当将（财神是 西 z3） */
        const pai = ['m1','m2','m3','m4','m5','m6','p1','p2','p3','p4','p5','p6',
                     's1','s2','s3','z3','z3'];
        ok('两张财神当将', H.is_double_joker_pair(pai, 'z3', 0));
        eq('只剩一张财神当将不算', H.is_double_joker_pair(pai.slice(0, 16), 'z3', 0), false);

        const shunzi = (t) => ({ kind: 'shunzi', tile: t, n_joker: 0 });
        const sets = [shunzi('m1'), shunzi('m4'), shunzi('p1'), shunzi('p4'), shunzi('s1')];
        const base2 = { mianzi: sets, pair: { tile: 'z3', n_joker: 2 }, flowers: [],
                        jokers: 2, seat: 0, zimo: false, rule };

        let r = Score.score({ ...base2, double_joker_pair: true, guiwei: false });
        const t1 = r.tai_list.find(x => x.name === '双财神作将');
        ok('双财神作将计 1 台', !! t1 && t1.tai === 1, JSON.stringify(r.tai_list));
        eq('双财神作将时不算归位', r.tai_list.some(x => x.name === '财神归位'), false);

        r = Score.score({ ...base2, pair: { tile: 'm9', n_joker: 0 },
                          jokers: 1, guiwei: true, double_joker_pair: false });
        const t2 = r.tai_list.find(x => x.name === '财神归位');
        ok('财神归位计 1 台', !! t2 && t2.tai === 1, JSON.stringify(r.tai_list));

        eq('没归位就没这台',
           Score.score({ ...base2, jokers: 1, guiwei: false }).tai_list.some(x => x.name === '财神归位'),
           false);
    }

    /* ---------- 9. 胡头表 & 闹闹 ---------- */
    console.log('\n--- 胡头 ---');
    {
        const shunzi = (t) => ({ kind: 'shunzi', tile: t, n_joker: 0 });
        const kezi   = (t, fulou = true) => ({ kind: 'kezi', tile: t, fulou, n_joker: 0 });
        const base   = {
            mianzi: [shunzi('m1')],
            pair:  { tile: 'm9', n_joker: 0 },
            flowers: [], jokers: 0, seat: 0, zimo: false, rule,
        };

        eq('碰软张 2 胡',  Score.mianzi_hutou(kezi('m5'), rule), 2);
        eq('碰硬张 4 胡',  Score.mianzi_hutou(kezi('z6'), rule), 4);
        eq('暗刻硬张 8 胡', Score.mianzi_hutou(kezi('z6', false), rule), 8);
        eq('明杠硬张 16 胡', Score.mianzi_hutou({ kind:'gang', tile:'z6', fulou:true,  angang:false, n_joker:0 }, rule), 16);
        eq('暗杠硬张 32 胡', Score.mianzi_hutou({ kind:'gang', tile:'z6', fulou:false, angang:true,  n_joker:0 }, rule), 32);

        /* 花牌 / 白板都是单张 4 胡 */
        eq('两张花牌 8 胡（+ 将牌 2）', Score.base_hutou({ ...base, flowers: ['f1','f2'] }), 10);
        eq('两张白板 8 胡（+ 将牌 2）', Score.base_hutou({ ...base, baiban: ['z5','z5'] }), 10);

        /* 闹闹：非财神中发白等价于花，按张数算 */
        const nao_ctx = { ...base, nao: true, joker: 'z6',
                          mianzi: [{ kind:'kezi', tile:'z7', fulou:true, n_joker:0 }] };
        eq('闹闹碰中按 3 张花算 12 胡', Score.base_hutou(nao_ctx), 12 + 2);
        eq('闹闹暗刻中也是 12 胡',
           Score.base_hutou({ ...nao_ctx, mianzi: [{ kind:'kezi', tile:'z7', fulou:false, n_joker:0 }] }), 12 + 2);
        eq('闹闹杠中按 4 张花算 16 胡',
           Score.base_hutou({ ...nao_ctx, mianzi: [{ kind:'gang', tile:'z7', angang:true, n_joker:0 }] }), 16 + 2);
        /* 财神自己不算 */
        eq('闹闹时财神那张不按花算',
           Score.base_hutou({ ...nao_ctx, joker: 'z7', mianzi: [shunzi('m1')] }), 2);
    }

    console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
    process.exitCode = fail ? 1 : 0;
})();
