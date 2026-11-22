/*
 *  MajiangWenling —— 温岭麻将规则引擎
 */
"use strict";

const Pai     = require('./pai');
const rule    = require('./rule');
const Shan    = require('./shan');
const Hule    = require('./hule');
const Score   = require('./score');
const Shoupai = require('./shoupai');
const Game    = require('./game');

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
    hutou_of_hand: Score.hutou_of_hand,
    tai_list:   Score.tai_list,
    lazi_list:  Score.lazi_list,
    Shoupai,
    Game,
};
