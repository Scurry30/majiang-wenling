/*
 *  牌谱记录 / 回放自检。
 *    node dev/record-test.js
 */
"use strict";

const Wenling = require('../lib');
const AI      = require('../lib/ai');
const { record_game, replay_game } = require('../lib/record');

const rule = Wenling.rule();

let fail = 0;
function ok(name, cond, extra = '') {
    console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + extra}`);
    if (!cond) fail++;
}
function eq(name, got, want) {
    const same = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${same ? '✓' : '✗'} ${name}: ${JSON.stringify(got)}${same ? '' : `（期望 ${JSON.stringify(want)}）`}`);
    if (!same) fail++;
}

(async () => {

    console.log('--- 记录一局 ---');
    const { record, result } = await record_game(rule, AI.create_policy(), { seed: 12345 });

    console.log(`  结果: ${result.type}` +
        (result.type === 'hule' ? `  P${result.winner} ${result.zimo ? '自摸' : '荣和'} ${result.score.defen} 分` : ''));
    console.log(`  决策条数: ${record.decisions.length}`);
    console.log(`  牌谱大小: ${JSON.stringify(record).length} 字节`);

    ok('记录了决策', record.decisions.length > 0);
    ok('牌谱足够小（< 20KB）', JSON.stringify(record).length < 20000);

    console.log('\n--- 回放 ---');
    const r2 = await replay_game(record);

    eq('回放结果类型一致', r2.result.type, result.type);
    if (result.type === 'hule') {
        eq('回放和牌者一致', r2.result.winner, result.winner);
        eq('回放和牌方式一致', r2.result.zimo, result.zimo);
        eq('回放台数一致', r2.result.score.tai, result.score.tai);
        eq('回放分数一致', r2.result.score.defen, result.score.defen);
    }
    eq('回放收支一致', r2.result.delta, result.delta);
    eq('回放动作条数一致', r2.log.length, r2.states.length);
    ok('抓到了逐手状态', r2.states.length > 10, `只有 ${r2.states.length} 步`);

    /* 状态快照的基本形状 */
    const s = r2.states[0];
    ok('快照含四家手牌', Array.isArray(s.hands) && s.hands.length === 4);
    ok('快照含牌墙数', typeof s.paishu === 'number');
    ok('快照含局名', typeof s.jushu === 'string' && s.jushu.endsWith('局'), s.jushu);

    console.log('\n--- 损坏的牌谱应当报错 ---');
    const bad = JSON.parse(JSON.stringify(record));
    bad.decisions[3].name = 'pon';
    let threw = false;
    try { await replay_game(bad) } catch (e) { threw = true; console.log('  （抛错：' + e.message + '）') }
    ok('错位牌谱会抛错而不是静默出错', threw);

    console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
    process.exitCode = fail ? 1 : 0;
})();
