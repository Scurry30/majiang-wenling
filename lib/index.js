/*
 *  MajiangWenling —— 温岭麻将规则引擎
 */
"use strict";

const Pai   = require('./pai');
const rule  = require('./rule');
const Shan  = require('./shan');
const Hule  = require('./hule');
const Score = require('./score');

module.exports = {
    Pai,
    rule,
    Shan:       Shan.Shan,
    qipai:      Shan.qipai,
    build:      Shan.build,
    mulberry32: Shan.mulberry32,
    hule:       Hule.hule,
    tingpai:    Hule.tingpai,
    to_counts:  Hule.to_counts,
    score:      Score.score,
    settle:     Score.settle,
    base_hutou: Score.base_hutou,
    tai_list:   Score.tai_list,
    lazi_list:  Score.lazi_list,
};
