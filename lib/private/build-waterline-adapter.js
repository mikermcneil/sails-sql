/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var machine = require('machine');
var DRIVER_INTERFACE = require('driver-interface');
var PJ = require('../../package.json');


/**
 * Module state
 */

// Private var to track of all the datastores that use this adapter.  In order for your adapter
// to be able to connect to the database, you'll want to expose this var publicly as well.
// (See the `registerDatastore()` method for info on the format of each datastore entry herein.)
//
// > Note that this approach of process global state will be changing in an upcoming version of
// > the Waterline adapter spec (a breaking change).  But if you follow the conventions laid out
// > below in this adapter template, future upgrades should be a breeze.
var registeredDatastores = {};


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

  // Build driver ahead of time (this is a machinepack- just a dictionary of
  // callables keyed by method name, basically... but with some extra goodies)
  var driver = machine.pack({
    name: PJ.name,
    description: PJ.description,
    defs: nmDefsByIdentity
  });
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // TODO: expose all underlying client libs (e.g. mysql, pg, etc) as top-level
  // properties on the driver, for convenience
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // Also, for our convenience, put together a slightly more familiar (but not
  // backwards-compatible) interface for us to use below:
  var ƒ = driver.customize({arginStyle:'serial', execStyle:'natural'});

  // Now we'll build a true Waterline adapter:  (for compatibility)
  var adapter = {
    identity: PJ.name,
    adapterApiVersion: 1,
    defaults: { host: 'localhost', port: 3306, schema: true },//«TODO: verify if these are even being used somewhere else (they're definitely not in use in the adapter itself!!)
    datastores: registeredDatastores,


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
    registerDatastore: (datastoreConfig, physicalModelsReport, done)=>{
      (async()=>{
        var datastoreName = datastoreConfig.identity;
        if (!datastoreName) { throw new Error('Consistency violation: A datastore should contain an "identity" property: a special identifier that uniquely identifies it across this app.  This should have been provided by Waterline core!  If you are seeing this message, there could be a bug in Waterline, or the datastore could have become corrupted by userland code, or other code in this adapter.  If you determine that this is a Waterline bug, please report this at https://sailsjs.com/bugs.'); }
        if (registeredDatastores[datastoreName]) { throw new Error('Consistency violation: Cannot register datastore: `' + datastoreName + '`, because it is already registered with this adapter!  This could be due to an unexpected race condition in userland code (e.g. attempting to initialize Waterline more than once), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'); }
        if (!datastoreConfig.url) {
          throw new Error('Invalid configuration for datastore `' + datastoreName + '`:  Missing `url` (See https://sailsjs.com/config/datastores#?the-connection-url for more info.)');
        }

        // =============================================================================================================
        // TODO: finish up with all this:
        // (most of it can move into the driver level)
        // =============================================================================================================
        // //  ╦  ╦╔═╗╦  ╦╔╦╗╔═╗╔╦╗╔═╗  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
        // //  ╚╗╔╝╠═╣║  ║ ║║╠═╣ ║ ║╣   │  │ ││││├┤ ││ ┬
        // //   ╚╝ ╩ ╩╩═╝╩═╩╝╩ ╩ ╩ ╚═╝  └─┘└─┘┘└┘└  ┴└─┘
        // // If a URL config value was not given, ensure that all the various pieces
        // // needed to create one exist.
        // var hasURL = _.has(inputs.config, 'url');

        // // Validate that the connection has a host and database property
        // if (!hasURL && !inputs.config.host) {
        //   return exits.badConfiguration(new Error('Datastore  `' + inputs.identity + '` config is missing a host value.'));
        // }

        // if (!hasURL && !inputs.config.database) {
        //   return exits.badConfiguration(new Error('Datastore  `' + inputs.identity + '` config is missing a value for the database name.'));
        // }

        // // Loop through every model assigned to the datastore we're registering,
        // // and ensure that each one's primary key is either required or auto-incrementing.
        // try {
        //   _.each(inputs.models, function checkPrimaryKey(modelDef, modelIdentity) {
        //     var primaryKeyAttr = modelDef.definition[modelDef.primaryKey];

        //     // Ensure that the model's primary key has either `autoIncrement` or `required`
        //     if (primaryKeyAttr.required !== true && (!primaryKeyAttr.autoMigrations || primaryKeyAttr.autoMigrations.autoIncrement !== true)) {
        //       throw new Error('In model `' + modelIdentity + '`, primary key `' + modelDef.primaryKey + '` must have either `required` or `autoIncrement` set.');
        //     }
        //   });
        // } catch (e) {
        //   return exits.badConfiguration(e);
        // }

        // //  ╔═╗╔═╗╔╗╔╔═╗╦═╗╔═╗╔╦╗╔═╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
        // //  ║ ╦║╣ ║║║║╣ ╠╦╝╠═╣ ║ ║╣   │  │ │││││││├┤ │   │ ││ ││││
        // //  ╚═╝╚═╝╝╚╝╚═╝╩╚═╩ ╩ ╩ ╚═╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
        // //  ┌─┐┌┬┐┬─┐┬┌┐┌┌─┐  ┬ ┬┬─┐┬
        // //  └─┐ │ ├┬┘│││││ ┬  │ │├┬┘│
        // //  └─┘ ┴ ┴└─┴┘└┘└─┘  └─┘┴└─┴─┘
        // // If the connection details were not supplied as a URL, make them into one.
        // // This is required for the underlying driver in use.
        // if (!_.has(inputs.config, 'url')) {
        //   var url = 'mysql://';
        //   var port = inputs.config.port || '5432';

        //   // If authentication is used, add it to the connection string
        //   if (inputs.config.user && inputs.config.password) {
        //     url += inputs.config.user + ':' + inputs.config.password + '@';
        //   }

        //   url += inputs.config.host + ':' + port + '/' + inputs.config.database;
        //   inputs.config.url = url;
        // }


        // //  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ┌┬┐┌─┐┌┐┌┌─┐┌─┐┌─┐┬─┐
        // //  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   │││├─┤│││├─┤│ ┬├┤ ├┬┘
        // //  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  ┴ ┴┴ ┴┘└┘┴ ┴└─┘└─┘┴└─
        // // Create a manager to handle the datastore connection config
        // var report;
        // try {
        //   report = Helpers.connection.createManager(inputs.config.url, inputs.config);
        // } catch (e) {
        //   if (!e.code || e.code === 'error') {
        //     return exits.error(new Error('There was an error creating a new manager for the connection with a url of: ' + inputs.config.url + '\n\n' + e.stack));
        //   }

        //   if (e.code === 'failed') {
        //     return exits.badConfiguration(new Error('There was an error creating a new manager for the connection with a url of: ' + inputs.config.url + '\n\n' + e.stack));
        //   }

        //   if (e.code === 'malformed') {
        //     return exits.badConfiguration(new Error('There was an error creating a new manager for the connection with a url of: ' + inputs.config.url + '\n\n' + e.stack));
        //   }

        //   return exits.error(new Error('There was an error creating a new manager for the connection with a url of: ' + inputs.config.url + '\n\n' + e.stack));
        // }


        // // Build up a database schema for this connection that can be used
        // // throughout the adapter
        // var dbSchema = {};

        // _.each(inputs.models, function buildSchema(val) {
        //   var identity = val.identity;
        //   var tableName = val.tableName;
        //   var definition = val.definition;

        //   dbSchema[tableName] = {
        //     identity: identity,
        //     tableName: tableName,
        //     definition: definition,
        //     attributes: definition,
        //     primaryKey: val.primaryKey
        //   };
        // });

        // // Store the connection
        // inputs.datastores[inputs.identity] = {
        //   manager: report.manager,
        //   config: inputs.config,
        //   driver: MySQL
        // };

        // // Store the db schema for the connection
        // inputs.modelDefinitions[inputs.identity] = dbSchema;
        // =============================================================================================================

        var manager = (
          await ƒ.createManager(datastoreConfig.url, (unexpectedFailureErr)=>{
            console.warn(
              'Warning: An unhandled error occured in this database manager or '+
              'in one of its active db connections. ', unexpectedFailureErr
            );
          }, datastoreConfig)
        ).manager;//«FUTURE: breaking change: don't return this annoying report wrapper!

        registeredDatastores[datastoreName] = { config: datastoreConfig, manager, driver };
        //                                    /\
        //                                    ||
        //                                    ||
        //|¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_¯_˘_/
        //|
        //| `manager`: The database-specific "connection manager" that we just built above.
        //|
        //| `config  : Configuration options for the datastore.  Should be passed straight through
        //|            from what was provided as the `datastoreConfig` argument to this method.
        //|
        //| `driver` : Optional.  A reference to a stateless, underlying Node-Machine driver.
        //|            (For instance `machinepack-postgresql` for the `sails-postgresql` adapter.)
        //|            Note that this stateless, standardized driver will be merged into the main
        //|            concept of an adapter in future versions of the Waterline adapter spec.
        //|            (See https://github.com/node-machine/driver-interface for more informaiton.)
        //
      })().then(()=>{ done(); }).catch((err)=>{ done(err); });
    },
    teardown: (datastoreName, done)=>{
      (async()=>{
        // If no specific datastoreName was sent, it means that we're supposed to
        // down ALL the datastores (instead of just the one)
        var dsEntryNames = datastoreName ? [ datastoreName ] : _.keys(registeredDatastores);
        for (let name of dsEntryNames) {
          let dsEntry = registeredDatastores[name];
          if (dsEntry === undefined) { throw new Error('Consistency violation: Attempting to tear down a datastore (`'+name+'`) which is not currently registered with this adapter.  This is usually due to a race condition in userland code (e.g. attempting to tear down the same ORM instance more than once), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'); }
          await ƒ.destroyManager(dsEntry.manager);
          delete registeredDatastores[name];
        }//∞
      })().then(()=>{ done(); }).catch((err)=>{ done(err); });
    },

    //  ██████╗ ███╗   ███╗██╗
    //  ██╔══██╗████╗ ████║██║
    //  ██║  ██║██╔████╔██║██║
    //  ██║  ██║██║╚██╔╝██║██║
    //  ██████╔╝██║ ╚═╝ ██║███████╗
    //  ╚═════╝ ╚═╝     ╚═╝╚══════╝
    //
    create: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    createEach: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    update: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    destroy: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    //  ██████╗  ██████╗ ██╗
    //  ██╔══██╗██╔═══██╗██║
    //  ██║  ██║██║   ██║██║
    //  ██║  ██║██║▄▄ ██║██║
    //  ██████╔╝╚██████╔╝███████╗
    //  ╚═════╝  ╚══▀▀═╝ ╚══════╝
    //
    find: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    join: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    count: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    sum: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    avg: (datastoreName, query, done)=>{
      // TODO
      return done();
    },
    //  ██████╗ ██████╗ ██╗
    //  ██╔══██╗██╔══██╗██║
    //  ██║  ██║██║  ██║██║
    //  ██║  ██║██║  ██║██║
    //  ██████╔╝██████╔╝███████╗
    //  ╚═════╝ ╚═════╝ ╚══════╝
    //
    define: (datastoreName, tableName, definition, done, meta)=>{
      // TODO
      return done();
    },
    drop: (datastoreName, tableName, unused, done, meta)=>{
      // TODO
      return done();
    },
    setSequence: (datastoreName, sequenceName, sequenceValue, done, meta)=>{
      // TODO
      return done();
    },
  };

  return adapter;
};
