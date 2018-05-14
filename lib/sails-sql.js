/**
 * Module dependencies
 */

var buildWaterlineAdapter = require('./private/build-waterline-adapter');
var DRIVER = require('./private/driver');


/**
 * @type {Ref} stateful Waterline adapter
 */

module.exports = buildWaterlineAdapter(DRIVER);
