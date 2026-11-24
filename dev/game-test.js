/*
 *  局进行自检。
 *    node dev/game-test.js [N]
 */
"use strict";

const Wenling = require('../lib');
const Game    = require('../lib/game');
const Shoupai = require('../lib/shoupai');

const rule = Wenling.rule();
let fail = 0;
function eq(name, got, want) {
    const ok2 = got === want;
    console.log(`${ok2 ? '✓' : '✗'} ${name}: ${got}${ok2 ? '' : `（期望 ${want}）`}`);
    if (!ok2) fail++;
}
function ok(name, cond, extra = '') {
    console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + extra}`);
    if (!cond) fail++;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function random_policy(seed, claimRate = 0.3) {
    const rnd = mulberry32(seed);
    return {
        dapai(hand) { const l = hand.dapai_list; return l[Math.floor(rnd() * l.length)] },
        hu_zimo()   { return true },
        hu_rong()   { return true },
        pon()       { return rnd() < claimRate },
        gang()      { return rnd() < claimRate },
        chi(hand, options) { return rnd() < claimRate ? options[0] : null },
        self_gang(hand) {
            const a = hand.angang_options(), k = hand.kakan_options();
            if (a.length && rnd() < 0.1) return { type: 'angang', tile: a[0] };
            if (k.length && rnd() < 0.1) return { type: 'kakan',  tile: k[0] };
            return null;
        },
    };
}

(async () => {

    /* ---------- 1. 和牌路径（手工构造） ---------- */
    console.log('--- 和牌与结算 ---');
    {
        const game = new Game(rule, {}, { seed: 1 });
        game.kaiju();
        game._hands[0] = Shoupai.from(
            ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p4','p5','p6','z1'],
            rule, game.shan.joker);
        game._hands[1] = Shoupai.from(
            ['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p4','p5','p6','z1'],
            rule, game.shan.joker);
        game._zhuang = 0;

        const claim = await game._claim(3, 'z1');
        eq('一炮一响取逆时针第一个（P0）', claim && claim.player, 0);
        eq('宣言类型是和牌', claim && claim.type, 'hu');

        const r = game._hule(0, { win_tile: 'z1' });
        ok('和牌结果存在', !!r && r.type === 'hule');
        eq('台数 = 平胡 1 + 硬胡 1', r.score.tai, 2);
        eq('基础胡头 = 将牌 z1 硬张 2', r.score.base, 2);
        eq('胡头 = 基础 2 + 底胡 20', r.score.hutou, 22);
        eq('分数 = 22 × 2²', r.score.defen, 88);
        eq('结算零和', r.delta.reduce((a, b) => a + b, 0), 0);
        eq('胡家收入 = 三家各付 88', r.delta[0], 264);
        ok('庄家和牌后连庄', game.zhuang === 0);
    }

    /* ---------- 2. 流局 ---------- */
    console.log('\n--- 流局 ---');
    {
        const game = new Game(rule, random_policy(7, 0), { seed: 7 });
        game.kaiju();
        const r = await game.run();
        eq('无鸣牌时打到流局', r.type, 'pingju');
        eq('流局零和', r.delta.reduce((a, b) => a + b, 0), 0);
        ok('流局时牌墙不超过 16 张', game.shan.paishu <= 16, `实际 ${game.shan.paishu}`);
        eq('流局庄家连庄', game.zhuang, 0);
        eq('流局本场 +1', game.changbang, 1);
    }

    /* ---------- 3. 压力测试 ---------- */
    const N = process.argv[2] ? +process.argv[2] : 200;
    console.log(`\n--- 压力测试 ${N} 局 ---`);
    let hule = 0, pingju = 0, maxTai = 0, lazi = 0, chis = 0, pons = 0, gangs = 0;

    for (let seed = 1; seed <= N; seed++) {
        try {
            const game = new Game(rule, random_policy(seed), { seed });
            game.kaiju();
            const r = await game.run();

            if (r.type === 'hule') {
                hule++;
                maxTai = Math.max(maxTai, r.score.tai);
                if (r.score.lazi.length) lazi++;
            }
            else pingju++;

            const sum = r.delta.reduce((a, b) => a + b, 0);
            if (sum !== 0) { fail++; console.error(`✗ [seed ${seed}] 结算不为零: ${sum}`) }

            for (const rec of game.log) {
                if (rec.action === '吃') chis++;
                if (rec.action === '碰') pons++;
                if (rec.action === '杠' || rec.action === '暗杠' || rec.action === '加杠') gangs++;
            }
        }
        catch (e) {
            fail++;
            console.error(`✗ [seed ${seed}] 抛异常: ${e.message}`);
            console.error(e.stack.split('\n').slice(1, 4).join('\n'));
        }
    }

    console.log(`  和牌 ${hule} 局 / 流局 ${pingju} 局`);
    console.log(`  最高台数 ${maxTai}，腊子 ${lazi} 次`);
    console.log(`  鸣牌统计: 吃 ${chis} / 碰 ${pons} / 杠 ${gangs}`);
    if (N >= 100) ok('有和牌产生（和牌路径被覆盖）', hule > 0, `和牌 ${hule}`);
    else console.log('  （局数较少，跳过「必须出现和牌」的断言）');
    ok(`全部 ${N} 局无异常且零和`, fail === 0, `失败 ${fail} 项`);

    console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
    process.exitCode = fail ? 1 : 0;
})();
