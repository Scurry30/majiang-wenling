/*
 *  MajiangWenling.Record —— 牌谱记录与回放
 *
 *  思路：不存每一步的完整快照，只存「种子 + 每一步决策」。
 *  回放时用同一个种子重新发牌，把决策按顺序喂回引擎，
 *  得到的过程和当时完全一致（引擎是确定性的）。
 *
 *  牌谱体积因此只有几 KB，但依赖引擎版本：引擎改了规则，老牌谱可能对不上，
 *  所以记录里带 version 和每条决策签名，错位会直接报错而不是静默出错。
 */
"use strict";

const Game = require('./game');

const METHODS = ['dapai', 'hu_zimo', 'hu_rong', 'pon', 'gang', 'chi', 'self_gang'];

/* 把一局的当前状态抽成纯数据，供界面渲染 */
function state_of(game) {
    return {
        joker:     game.shan.joker,
        indicator: game.shan.indicator,
        paishu:    game.shan.paishu,
        nao:       game.nao,
        zhuang:    game.zhuang,
        jushu:     game.jushu_name(),
        changbang: game.changbang,
        scores:    game.score.slice(),
        menfeng:   [0, 1, 2, 3].map(i => game.menfeng(i)),
        hands: game.hands.map(h => ({
            pai:     h.pai.slice(),
            flowers: h.flowers.slice(),
            fulou:   h.fulou.map(m => ({ kind: m.kind, tiles: m.tiles.slice() })),
            shoupaishu: h.shoupaishu,
        })),
        he: game.he.map(h => h.slice()),
    };
}

/* 记录型策略：把每次决策原样记下来 */
function record_policy(policy, log) {
    const names = METHODS.filter(n => typeof policy[n] === 'function');
    const wrapped = {};
    for (const n of names) {
        wrapped[n] = (...args) =>
            Promise.resolve(policy[n](...args)).then(answer => {
                log.push({ name: n, answer });
                return answer;
            });
    }
    return { policy: wrapped, names };
}

/* 回放型策略：按记录顺序把决策还回去 */
function replay_policy(record) {
    let i = 0;
    const next = name => {
        const rec = record.decisions[i++];
        if (! rec)             throw new Error(`牌谱不完整：缺少第 ${i} 步（${name}）`);
        if (rec.name !== name) throw new Error(`牌谱错位：第 ${i} 步记为 ${rec.name}，实际调用 ${name}`);
        return rec.answer;
    };
    const p = {};
    for (const n of record.methods) p[n] = () => next(n);
    return p;
}

function summary_of(game, result) {
    return {
        type:   result.type,
        winner: result.type === 'hule' ? result.winner : null,
        zimo:   result.type === 'hule' ? result.zimo : false,
        defen:  result.type === 'hule' ? result.score.defen : 0,
        tai:    result.type === 'hule' ? result.score.tai : 0,
        delta:  result.delta,
        jushu:  game.jushu_name_at(game.start_jushu),
    };
}

function make_record({ seed, rule, decisions, methods, game, result }) {
    return { version: 2, seed, rule, methods, decisions,
             summary: summary_of(game, result) };
}

/**
 * 打一局并记录。
 * @returns {{record, result, game}}
 */
async function record_game(rule, policy, opts = {}) {
    const decisions = [];
    const { policy: wrapped, names } = record_policy(policy, decisions);

    const game = new Game(rule, wrapped, opts);
    game.kaiju();
    const result = await game.run();

    return {
        record: make_record({ seed: opts.seed, rule, decisions, methods: names, game, result }),
        result, game,
    };
}

/**
 * 回放：重跑一遍，顺便抓下每一步的界面状态。
 * @returns {{game, result, states, log}}
 */
async function replay_game(record) {
    if (record.version !== 2) throw new Error(`不支持的牌谱版本: ${record.version}`);

    const states = [];
    const game = new Game(record.rule, replay_policy(record), { seed: record.seed });
    game._on_update = g => states.push(state_of(g));

    game.kaiju();
    const result = await game.run();

    return { game, result, states, log: game.log };
}

module.exports = {
    record_game, replay_game, state_of,
    record_policy, replay_policy, summary_of, make_record,
};
