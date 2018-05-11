/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var machine = require('machine');
var DRIVER_INTERFACE = require('driver-interface');
var PJ = require('../../package.json');


/**
 * buildWaterlineAdapter()
 *
 * @param  {Dictionary} driverImpl
 * @return {Ref} [waterline adapter]
 */
module.exports = function buildWaterlineAdapter(driverImpl) {

  var nmDefsByIdentity = {};
  for (let methodName in driverImpl) {
    let identity = _.kebabCase(methodName);
    let abstractDef = DRIVER_INTERFACE[identity];
    if (!abstractDef) {
      throw new Error(`Unrecognized method: "${methodName}"`);
    }

    let nmDef = Object.assign(_.cloneDeep(abstractDef), {
      fn: async(inputs, exits)=>{
        // TODO: If method implementation is not an AsyncFunction, then don't use
        // `async` or `await` here.
        exits.success(await driverImpl[methodName](inputs));
      }//ƒ
    });
    nmDefsByIdentity[identity] = nmDef;
  }//∞

  var adapter = machine.pack({
    name: PJ.name,
    description: PJ.description,
    defs: nmDefsByIdentity
  });

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // TODO: the rest:
  //  • expose all underlying client libs as top-level things, for convenience
  //  • then wrap in shim for compatibility as Waterline adapter
  //  • attach "datastore" shim for compatibility w/ sails-hook-orm
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  return adapter;
};
