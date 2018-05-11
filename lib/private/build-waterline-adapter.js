/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var machine = require('machine');


/**
 * buildWaterlineAdapter()
 *
 * @param  {Dictionary} driverImpl
 * @param  {String} dialect
 * @return {Ref} [waterline adapter]
 */
module.exports = function buildWaterlineAdapter(driverImpl, dialect) {

  var nmDefsByIdentity = {};
  for (let methodName in driverImpl) {
    let abstractDef = { friendlyName: 'TODO' };
    // ^^TODO: load actual abstract def from `driver-interface`
    let nmDef = Object.assign({}, abstractDef, {
      fn: async(inputs, exits)=>{
        exits.success(await driverImpl[methodName](inputs));
      }//ƒ
      // TODO: If method implementation is not an AsyncFunction, then don't use
      // `async` or `await` here.
    });
    nmDefsByIdentity[_.kebabCase(methodName)] = nmDef;
  }//∞

  var adapter = machine.pack({
    name: 'sails-sql ('+dialect+')',
    description: 'Structured Node.js bindings for '+dialect+'.',
    defs: nmDefsByIdentity
  });

  // TODO: the rest

  return adapter;
};
