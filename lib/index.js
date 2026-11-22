/*
 *  MajiangWenling —— 温岭麻将规则引擎
 */
"use strict";

const Pai  = require('./pai');
const rule = require('./rule');
const Shan = require('./shan');
const Hule = require('./hule');

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
};
