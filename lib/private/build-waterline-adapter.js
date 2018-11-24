/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var machine = require('machine');
var ABSTRACT_DRIVER_INTERFACE = require('driver-interface');
var WLUtils = require('waterline-utils');
var PJ = require('../../package.json');


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// FUTURE: With the notable exception of `.join`, this utility is implementation-
// agnostic-- enough so that it could simply be included in a future version of
// Waterline core and provided to adapter authors as a convenience function.
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -


/**
 * buildWaterlineAdapter()
 *
 * @param  {Dictionary} driverImpl
 * @return {Ref} [waterline adapter]
 */
module.exports = function buildWaterlineAdapter(driverImpl) {

  // Private var to track of all the datastores that use this adapter.  In order for your adapter
  // to be able to connect to the database, you'll want to expose this var publicly as well.
  // (See the `registerDatastore()` method for info on the format of each datastore entry herein.)
  //
  // > Note that this approach of process global state will be changing in an upcoming version of
  // > the Waterline adapter spec (a breaking change).  But if you follow the conventions laid out
  // > below in this adapter template, future upgrades should be a breeze.
  var registeredDsEntries = {};

  // Keep track of all the model definitions registered by the adapter (for the entire Node process).
  // (indexed by the model's `identity` -- NOT by its `tableName`!!)
  var dryOrm = {
    models: {}
  };

  // Build methods
  var nmDefsByIdentity = {};
  for (let methodName in driverImpl) {
    let identity = _.kebabCase(methodName);
    let abstractDef = ABSTRACT_DRIVER_INTERFACE[identity];
    if (!abstractDef) {
      throw new Error(`Unrecognized method: "${methodName}"`);
    }

    let nmDef = Object.assign(_.cloneDeep(abstractDef), {
      // If method implementation is not an AsyncFunction, then don't
      // use `async` or `await` here (for increased performance and to
      // resolve issues with this usage styles combined with `sync: true`
      // methods).
      fn: (
        driverImpl[methodName].constructor.name === 'AsyncFunction'?
        async(inputs, exits)=>{
          exits.success(await driverImpl[methodName](inputs));
        }
        :
        (inputs, exits)=>{
          exits.success(driverImpl[methodName](inputs));
        }
      )//ƒ
    });
    nmDefsByIdentity[identity] = nmDef;
  }//∞

  // Build driver ahead of time (this is a machinepack- just a dictionary of
  // callables keyed by method name, basically... but with some extra goodies)
  var driver = machine.pack({
    name: PJ.name,
    description: PJ.description,
    defs: nmDefsByIdentity
  });

  // Also, for our convenience, put together a slightly more familiar (but not
  // backwards-compatible) interface for us to use below:
  var ƒ = driver.customize({arginStyle:'serial', execStyle:'natural'});

  // Hydrate a utility we'll use below to deduplicate common logic shared between
  // most methods that this adapter implements.
  var runStdAdapterMethod = _prepareStdAdapterMethodRunner(registeredDsEntries, ƒ);

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // FUTURE: (maybe-- bears further thought... might want to handle it
  // differently for this adapter-- e.g. maybe expose knex instead?  Or even
  // expose it in addition and also still expose the client libs as well?)
  // ```
  // //Expose all underlying client libs (e.g. mysql, pg, etc) as top-level
  // //properties on the "wet" driver, for convenience
  // driver.mysql = getLibrary('mysql');
  // driver.pg = getLibrary('pg');
  // //… etc
  // ```
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // Now we'll build a true Waterline adapter:  (for compatibility)
  var adapter = {
    identity: PJ.name,
    adapterApiVersion: 1,
    defaults: {
      host: 'localhost',
      //^^unless otherwise specified, default datastore settings to use localhost
      // (default port depends on the dialect)

      schema: true
      //^^this is normally only supported as a model setting, but sails-hook-orm
      // interprets it as a model setting and applies it to all models automatically.
    },
    datastores: registeredDsEntries,

    //////////////////////////////////////////////////////////////////////////////////////////////////
    //  ██╗     ██╗███████╗███████╗ ██████╗██╗   ██╗ ██████╗██╗     ███████╗                        //
    //  ██║     ██║██╔════╝██╔════╝██╔════╝╚██╗ ██╔╝██╔════╝██║     ██╔════╝                        //
    //  ██║     ██║█████╗  █████╗  ██║      ╚████╔╝ ██║     ██║     █████╗                          //
    //  ██║     ██║██╔══╝  ██╔══╝  ██║       ╚██╔╝  ██║     ██║     ██╔══╝                          //
    //  ███████╗██║██║     ███████╗╚██████╗   ██║   ╚██████╗███████╗███████╗                        //
    //  ╚══════╝╚═╝╚═╝     ╚══════╝ ╚═════╝   ╚═╝    ╚═════╝╚══════╝╚══════╝                        //
    //                                                                                              //
    // Lifecycle adapter methods:                                                                   //
    // Methods related to setting up and tearing down; registering/un-registering datastores.       //
    //////////////////////////////////////////////////////////////////////////////////////////////////
    registerDatastore: (dsConfig, physicalModelsReport, done)=>{
      (async()=>{
        // > NOTE: For more complete interface info on registerDatastore(), including documented data structure, see:
        // > https://github.com/balderdashy/sails-mongo/blob/e0a2aeac95086ea5275da0dc56b93d75b24a6222/lib/index.js#L157-L187
        var datastoreName = dsConfig.identity;
        if (!datastoreName) { throw new Error('Consistency violation: A datastore should contain an "identity" property: a special identifier that uniquely identifies it across this app.  This should have been provided by Waterline core!  If you are seeing this message, there could be a bug in Waterline, or the datastore could have become corrupted by userland code, or other code in this adapter.  If you determine that this is a Waterline bug, please report this at https://sailsjs.com/bugs.'); }
        if (registeredDsEntries[datastoreName]) { throw new Error('Consistency violation: Cannot register datastore: `' + datastoreName + '`, because it is already registered with this adapter!  This could be due to an unexpected race condition in userland code (e.g. attempting to initialize Waterline more than once), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'); }

        var adapterDisplayPhrase = PJ.name+' adapter'+(datastoreName === 'default'?'':' ("" datastore)');

        WLUtils.normalizeDatastoreConfig(dsConfig);

        var manager = (
          await ƒ.createManager(
            dsConfig.url,
            (unexpectedFailureErr)=>{
              console.warn('Warning from '+adapterDisplayPhrase+': An unhandled error was emitted by the database manager/pool or one of its active db connections. ', unexpectedFailureErr);
            },
            _.omit(dsConfig, ['url', 'adapter', 'identity', 'schema'])
          )
          .intercept('malformed', (err)=>flaverr({ message: 'Invalid datastore configuration for '+adapterDisplayPhrase+'.  '+err.message+'\n [?] https://sailsjs.com/config/datastores#?the-connection-url', code: 'E_MALFORMED_DATASTORE_CONFIG' }, err))
          .intercept('failed', (err)=>flaverr({ message: 'Failed to connect with the given datastore configuration.   Could not create new manager/pool using '+adapterDisplayPhrase+'.  '+err.message,  code: 'E_FAILED_TO_CONNECT' }, err))
          .intercept((err)=>flaverr({ message: 'Unexpected error creating new manager/pool using '+adapterDisplayPhrase+'.  '+err.message }, err))
        ).manager;

        registeredDsEntries[datastoreName] = { config: dsConfig, manager, driver };
        //                                    /\
        //                                    ||
        //                                    ||
        //|¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_˘_/
        //|
        //| `manager`: The database-specific "connection manager" that we just built above.
        //|
        //| `config  : Configuration options for the datastore.  Should be passed straight through
        //|            from what was provided as the `dsConfig` argument to this method.
        //|
        //| `driver` : Optional.  A reference to a stateless, underlying Node-Machine driver.
        //|            Note that this stateless, standardized driver will be merged into the main
        //|            concept of an adapter in future versions of the Waterline adapter spec.
        //|            (See https://github.com/node-machine/driver-interface for more informaiton.)
        //|            Also note that this is currently expected to consist of Callables -- aka "wet machines"
        //|            as well as, potentially, the underlying client library.
        //

        var modelIncompatibilitiesByIdn = {};
        for (let tableName in physicalModelsReport) {
          if (physicalModelsReport[tableName].tableName !== tableName) { throw new Error(`Consistency violation: This should never happen -- detected mismatched table name in ${adapterDisplayPhrase}`); }
          let identity = physicalModelsReport[tableName].identity;
          let dryModel = _.pick(physicalModelsReport[tableName], ['primaryKey', 'tableName', 'identity']);
          dryModel.attributes = physicalModelsReport[tableName].definition;
          if (dryOrm.models[identity]) { throw new Error(`Consistency violation: Cannot register model: ${identity}, because it is already registered with this adapter: the ${adapterDisplayPhrase}!  This could be due to an unexpected race condition in userland code (e.g. attempting to initialize multiple ORM instances at the same time), or it could be due to a bug in this adapter.  (If you get stumped, reach out at http://sailsjs.com/support.)`); }
          dryOrm.models[identity] = dryModel;
          // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          // ^^FUTURE: Remove the need for everything above inside this `for` loop up until here by
          // giving the adapter some kind of simpler access to the orm instance, or an accessor function
          // for models.
          // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          if (ƒ.verifyModelDef) {
            await ƒ.verifyModelDef(dryModel)
            .meta({dialect: manager.dialect})
            .tolerate('invalid', (err)=>{
              modelIncompatibilitiesByIdn[identity] = err.raw;
            });
          }//ﬁ
        }//∞  </ each phModel >

        var numNotCompatible = _.keys(modelIncompatibilitiesByIdn).length;
        if (numNotCompatible > 0) {
          throw flaverr('E_MODELS_NOT_COMPATIBLE', new Error(
            numNotCompatible+' model(s) are not compatible with this adapter:\n'+
            _.reduce(modelIncompatibilitiesByIdn, (memo, incompatibility, modelIdentity)=>memo + '• `'+modelIdentity+'`  :: '+incompatibility+'\n', '')
          ));
        }//-•
      })().then(()=>{ done(); }).catch((err)=>{ done(err); });
    },
    teardown: (datastoreName, done)=>{
      (async()=>{
        // If no specific datastoreName was sent, it means that we're supposed to
        // down ALL the datastores (instead of just the one)
        var dsEntryNames = datastoreName ? [ datastoreName ] : _.keys(registeredDsEntries);
        for (let name of dsEntryNames) {
          let dsEntry = registeredDsEntries[name];
          if (dsEntry === undefined) { throw new Error('Consistency violation: Attempting to tear down a datastore (`'+name+'`) which is not currently registered with this adapter.  This is usually due to a separate (& usually unrelated) setup-time error or race condition in userland code (e.g. attempting to tear down the same ORM instance more than once).  (If you get stumped, reach out at https://sailsjs.com/support.)'); }
          await ƒ.destroyManager(dsEntry.manager);
          delete registeredDsEntries[name];
        }//∞
      })().then(()=>{ done(); }).catch((err)=>{ done(err); });
    },

    //  ██████╗ ███╗   ███╗██╗
    //  ██╔══██╗████╗ ████║██║
    //  ██║  ██║██╔████╔██║██║
    //  ██║  ██║██║╚██╔╝██║██║
    //  ██████╔╝██║ ╚═╝ ██║███████╗
    //  ╚═════╝ ╚═╝     ╚═╝╚══════╝
    create: (datastoreName, query, done)=>{
      runStdAdapterMethod(datastoreName, query.meta, async(connection)=>ƒ.createRecord(query, connection, dryOrm), done);
    },
    createEach: (datastoreName, query, done)=>{
      runStdAdapterMethod(datastoreName, query.meta, async(connection)=>ƒ.createEachRecord(query, connection, dryOrm), done);
    },
    update: (datastoreName, query, done)=>{
      runStdAdapterMethod(datastoreName, query.meta, async(connection)=>ƒ.updateRecords(query, connection, dryOrm), done);
    },
    destroy: (datastoreName, query, done)=>{
      runStdAdapterMethod(datastoreName, query.meta, async(connection)=>ƒ.destroyRecords(query, connection, dryOrm), done);
    },
    //  ██████╗  ██████╗ ██╗
    //  ██╔══██╗██╔═══██╗██║
    //  ██║  ██║██║   ██║██║
    //  ██║  ██║██║▄▄ ██║██║
    //  ██████╔╝╚██████╔╝███████╗
    //  ╚═════╝  ╚══▀▀═╝ ╚══════╝
    //
    find: (datastoreName, query, done)=>{
      runStdAdapterMethod(datastoreName, query.meta, async(connection)=>ƒ.findRecords(query, connection, dryOrm), done);
    },
    // join: (datastoreName, query, done)=>{
    //   (async()=>{
    //     // Based on:
    //     // • https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/join.js
    //     // • https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/join.js
    //     // TODO
    //   })().then((result)=>{ done(undefined, result); }).catch((err)=>{ done(err); });
    // },
    count: (datastoreName, query, done)=>{
      runStdAdapterMethod(datastoreName, query.meta, async(connection)=>ƒ.countRecords(query, connection, dryOrm), done);
    },
    sum: (datastoreName, query, done)=>{
      runStdAdapterMethod(datastoreName, query.meta, async(connection)=>ƒ.sumRecords(query, connection, dryOrm), done);
    },
    avg: (datastoreName, query, done)=>{
      runStdAdapterMethod(datastoreName, query.meta, async(connection)=>ƒ.avgRecords(query, connection, dryOrm), done);
    },
    //  ██████╗ ██████╗ ██╗
    //  ██╔══██╗██╔══██╗██║
    //  ██║  ██║██║  ██║██║
    //  ██║  ██║██║  ██║██║
    //  ██████╔╝██████╔╝███████╗
    //  ╚═════╝ ╚═════╝ ╚══════╝
    //
    define: (datastoreName, tableName, definition, done, meta)=>{
      meta = meta || {};
      runStdAdapterMethod(datastoreName, meta, async(connection)=>{
        let columns = _.reduce(definition, (columns, attrDef)=>{
          columns.push(_.pick(attrDef, 'columnName', 'unique', 'columnType', 'autoIncrement'));
          return columns;
        }, []);
        return ƒ.definePhysicalModel(connection, tableName, columns, meta);
      });
    },
    drop: (datastoreName, tableName, unused, done, meta)=>{
      meta = meta || {};
      runStdAdapterMethod(datastoreName, meta, async(connection)=>ƒ.dropPhysicalModel(connection, tableName, meta));
    },
    setSequence: (datastoreName, sequenceName, sequenceValue, done, meta)=>{
      meta = meta || {};
      runStdAdapterMethod(datastoreName, meta, async(connection)=>ƒ.setPhysicalSequence(connection, sequenceName, sequenceValue, meta));
    },
  };

  adapter.ƒ = adapter.f = ƒ;

  return adapter;
};







////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  ██████╗ ██████╗ ██╗██╗   ██╗ █████╗ ████████╗███████╗
//  ██╔══██╗██╔══██╗██║██║   ██║██╔══██╗╚══██╔══╝██╔════╝██╗
//  ██████╔╝██████╔╝██║██║   ██║███████║   ██║   █████╗  ╚═╝
//  ██╔═══╝ ██╔══██╗██║╚██╗ ██╔╝██╔══██║   ██║   ██╔══╝  ██╗
//  ██║     ██║  ██║██║ ╚████╔╝ ██║  ██║   ██║   ███████╗╚═╝
//  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚═╝  ╚═╝   ╚═╝   ╚══════╝
//
// Under-construction named utility functions that have not yet been
// extrapolated into their own separate files:
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * FUTURE: pull this into another file
 */
function _prepareStdAdapterMethodRunner(registeredDsEntries, ƒ) {
  /**
   * > For posterity, see also:
   * > https://github.com/balderdashy/sails-mongo/blob/2816d81359a5846550c90bd1dbfa98967ac13786/lib/private/build-std-adapter-method.js
   * > https://github.com/balderdashy/sails-mongo/blob/2816d81359a5846550c90bd1dbfa98967ac13786/lib/private/do-with-connection.js#L221
   */
  return (datastoreName, meta, during, done)=>{
    (async()=>{
      var dsEntry = registeredDsEntries[datastoreName];
      if (dsEntry === undefined) { throw new Error('Consistency violation: Cannot do that with datastore (`'+datastoreName+'`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at http://sailsjs.com/support.)'); }

      var wasConnectionProvided;
      var connection;
      if (meta && meta.leasedConnection) {
        wasConnectionProvided = true;
        connection = meta.leasedConnection;
      } else {
        connection = (
          await ƒ.getConnection(dsEntry.manager, meta)
          .intercept('failed', (err)=>err.raw.error)
        ).connection;
      }

      var temporarilyToleratedErr;
      var result = await during(connection)
      .tolerate((err)=>{
        temporarilyToleratedErr = err;
      });

      if (!wasConnectionProvided) {
        await ƒ.releaseConnection(connection, meta)
        .intercept((err)=>temporarilyToleratedErr || flaverr({ message: 'The code using this db connection ran successfully, but afterwards there was an error automatically releasing the connection: '+err.message }, err));
      }//>-

      if (temporarilyToleratedErr) {
        throw temporarilyToleratedErr;
      }

      return result;
    })().then((result)=>{ done(undefined, result); }).catch((err)=>{ done(err); });
  };//ƒ
}//ƒ
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
