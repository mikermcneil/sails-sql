/**
 * Module dependencies
 */

var util = require('util');
var url = require('url');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var buildWaterlineAdapter = require('./private/build-waterline-adapter');

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// TODO: make these require calls conditional to speed up load time:
var felix = require('mysql');
// TODO: the others like 'pg', etc.
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// ==============================================================================
// ==============================================================================
// ==============================================================================
// TODO: first, implement as a bag of completely stateless functions (but use the "classical" implementation type)
// TODO: next, bundle up those functions into runtime-callable things using `machine`+`driver-interface`
// TODO: figure out how to deal with configuration (mysql vs postgresql vs oracle, etc)
// ==============================================================================
// ==============================================================================
// ==============================================================================

module.exports = buildWaterlineAdapter({

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  createManager: async function({connectionString, onUnexpectedFailure, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // TODO: negotiate dialect
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // Validate and parse `meta` (if specified).
    // Supported options are explicitly whitelisted below (per dialect).
    var _underlyingDbClientConfig = {};
    if (meta) {
      // MySQL Client Options:  (will be passed into `.createPool()`)
      //  [?] https://github.com/felixge/node-mysql#connection-options
      [
        // Basic:
        'host', 'port', 'database', 'user', 'password',
        'charset', 'timezone', 'ssl',

        // Advanced:
        'connectTimeout', 'stringifyObjects', 'insecureAuth', 'typeCast',
        'queryFormat', 'supportBigNumbers', 'bigNumberStrings', 'dateStrings',
        'debug', 'trace', 'multipleStatements', 'flags',

        // Pool-specific:
        'acquireTimeout', 'waitForConnections', 'connectionLimit', 'queueLimit',

      ].forEach((mysqlClientConfKeyName)=>{
        if (meta[mysqlClientConfKeyName] !== undefined) {
          _underlyingDbClientConfig[mysqlClientConfKeyName] = meta[mysqlClientConfKeyName];
        }
      });//∞
    }//ﬁ

    // =============================================================================================================
    // TODO: finish up with all this:
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
    //   var port = inputs.config.port || '3306';

    //   // If authentication is used, add it to the connection string
    //   if (inputs.config.user && inputs.config.password) {
    //     url += inputs.config.user + ':' + inputs.config.password + '@';
    //   }

    //   url += inputs.config.host + ':' + port + '/' + inputs.config.database;
    //   inputs.config.url = url;
    // }
    // =============================================================================================================

    // Validate & parse connection string, pulling out MySQL client config
    // (call `malformed` if invalid).
    //
    // Remember: connection string takes priority over `meta` in the event of a conflict.
    try {
      var urlToParse = connectionString;
      // We don't actually care about the protocol, but `url.parse()` returns funky results
      // if the argument doesn't have one.  So we'll add one if necessary.
      // See https://en.wikipedia.org/wiki/Uniform_Resource_Identifier#Syntax
      if (!urlToParse.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
        urlToParse = 'mysql://' + urlToParse;
      }
      var parsedConnectionStr = url.parse(urlToParse);

      // Parse port & host
      var DEFAULT_HOST = 'localhost';
      var DEFAULT_PORT = 3306;
      // TODO: bring in fancier version of this code (believe it's in sails-mysql or sails-mongo -- or maybe redis?)
      if (parsedConnectionStr.port) {
        _underlyingDbClientConfig.port = +parsedConnectionStr.port;
      } else {
        _underlyingDbClientConfig.port = DEFAULT_PORT;
      }

      if (parsedConnectionStr.hostname) {
        _underlyingDbClientConfig.host = parsedConnectionStr.hostname;
      } else {
        _underlyingDbClientConfig.host = DEFAULT_HOST;
      }

      // Parse user & password
      if (parsedConnectionStr.auth && _.isString(parsedConnectionStr.auth)) {
        var authPieces = parsedConnectionStr.auth.split(/:/);
        if (authPieces[0]) {
          _underlyingDbClientConfig.user = authPieces[0];
        }
        if (authPieces[1]) {
          _underlyingDbClientConfig.password = authPieces[1];
        }
      }

      // Parse database name
      if (_.isString(parsedConnectionStr.pathname)) {
        var _databaseName = parsedConnectionStr.pathname;
        // Trim leading and trailing slashes
        _databaseName = _databaseName.replace(/^\/+/, '');
        _databaseName = _databaseName.replace(/\/+$/, '');
        // If anything is left, use it as the database name.
        if (_databaseName) {
          _underlyingDbClientConfig.database = _databaseName;
        }
      }
    } catch (err) {
      err.message = util.format('Provided value (`%s`) is not a valid MySQL connection string.', connectionString) + ' Error details: ' + err.message;
      throw {malformed: {error: err, meta: meta}};
    }

    // Create a connection pool.
    //
    // More about using pools with node-mysql:
    //  • https://github.com/felixge/node-mysql#pooling-connections
    var pool = felix.createPool(_underlyingDbClientConfig);

    // Bind an "error" handler in order to handle errors from connections in the pool,
    // or from the pool itself. Otherwise, without any further protection, if any MySQL
    // connections in the pool die, then the process would crash with an error.
    //
    // For more background, see:
    //  • https://github.com/felixge/node-mysql/blob/v2.10.2/Readme.md#error-handling
    pool.on('error', (err)=>{
      // When/if something goes wrong in this pool, call the `onUnexpectedFailure` notifier
      // (if one was provided)
      if (onUnexpectedFailure) {
        onUnexpectedFailure(err || new Error('One or more pooled connections to MySQL database were lost. Did the database server go offline?'));
      }
    });//œ

    // Finally, build and return the manager.
    return {
      manager: {
        pool: pool,
        connectionString: connectionString
      },
      meta: meta
    };
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  destroyManager: async function({manager, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    return new Promise((resolve, reject)=>{
      switch ('mysql') {// TODO: negotiate dialect
        case 'mysql':
          manager.pool.end((err)=>{
            if (err) {
              let error = flaverr({
                message: 'Failed to destroy the MySQL connection pool and/or gracefully end all connections in the pool.  '+err.message
              }, err);
              let report = { error, meta };
              reject({failed: report});
            } else {
              // All connections in the pool have ended.
              resolve({ meta });
            }
          });//_∏_
          break;
        default: throw new Error('Unsupported dialect');
      }
    });//_∏_
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  getConnection: async function({manager, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    return new Promise((resolve, reject)=>{
      switch ('mysql') {// TODO: negotiate dialect
        case 'mysql':
          manager.pool.getConnection((err, connection)=>{
            if (err) {
              let report = { error: err, meta };
              reject({failed: report});
            } else {
              resolve({ connection, meta });
            }
          });//_∏_
          break;
        default: throw new Error('Unsupported dialect');
      }
    });//_∏_
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  releaseConnection: async function({connection, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    return new Promise((resolve, reject)=>{
      switch ('mysql') {// TODO: negotiate dialect
        case 'mysql':
          // TODO
          // // Release connection.
          // try {
          //   // Note that if this driver is adapted to support managers which spawn
          //   // ad-hoc connections or manage multiple pools/replicas using PoolCluster,
          //   // then relevant settings would need to be included in the manager instance
          //   // so that connections can be appropriately released/destroyed here.
          //   //
          //   // For now, since we only support a single pool, we simply release the
          //   // connection back to the pool.
          //   inputs.connection.release();

          //   // If we made it here, releasing the connection gracefully must have worked.
          //   return exits.success();
          // } catch (_releaseErr) {
          //   // If the connection cannot be released back to the pool gracefully,
          //   // try to force it to disconnect.
          //   try {
          //     inputs.connection.destroy();

          //     // If even THAT fails, exit via `error`.
          //   } catch (_destroyErr) {
          //     return exits.error(new Error('Could not release MySQL connection gracefully, and attempting to forcibly destroy the connection threw an error.  Details:\n=== === ===\n' + _destroyErr.stack + '\n\nAnd error details from the original graceful attempt:\n=== === ===\n' + _releaseErr.stack));
          //   }

          //   // Otherwise if we're here, while we could not release the MySQL connection
          //   // gracefully, we were able to forcibly destroy it.
          //   return exits.success({
          //     meta: inputs.meta
          //   });
          // }
          break;
        default: throw new Error('Unsupported dialect');
      }
    });//_∏_
  },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // verifyModelDef: async function({modelDef}) {
  //   // TODO
  // },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  createRecord: async function({query, connection, dryOrm}) {

    // TODO
  },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // createEachRecord: async function({query, connection, dryOrm}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // updateRecords: async function({query, connection, dryOrm}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // destroyRecords: async function({query, connection, dryOrm}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // findRecords: async function({query, connection, dryOrm}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // countRecords: async function({query, connection, dryOrm}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // sumRecords: async function({query, connection, dryOrm}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // avgRecords: async function({query, connection, dryOrm}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // definePhysicalModel: async function({TODO, meta}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // dropPhysicalModel: async function({TODO, meta}) {
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // setPhysicalSequence: async function({TODO, meta}) {
  //   // TODO
  // },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  sendNativeQuery: async function({TODO, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // TODO
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  parseNativeQueryError: async function({TODO, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // TODO
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  beginTransaction: async function({TODO, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // TODO
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  commitTransaction: async function({TODO, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // TODO
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  rollbackTransaction: async function({TODO, meta}) {
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
    // to take advantage of runner's natural support for this through `.meta()`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // TODO
  },



  ///////////////////////////////////////////////////////////////////////////////////////
  //  ██████╗ ███████╗██████╗ ██████╗ ███████╗ ██████╗ █████╗ ████████╗███████╗██████╗
  //  ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╔══██╗
  //  ██║  ██║█████╗  ██████╔╝██████╔╝█████╗  ██║     ███████║   ██║   █████╗  ██║  ██║
  //  ██║  ██║██╔══╝  ██╔═══╝ ██╔══██╗██╔══╝  ██║     ██╔══██║   ██║   ██╔══╝  ██║  ██║
  //  ██████╔╝███████╗██║     ██║  ██║███████╗╚██████╗██║  ██║   ██║   ███████╗██████╔╝
  //  ╚═════╝ ╚══════╝╚═╝     ╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═════╝
  //  DEPRECATED METHODS:
  ///////////////////////////////////////////////////////////////////////////////////////

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  parseNativeQueryResult: async()=>{
    throw new Error('parseNativeQueryResult() is not supported by this adapter.');
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  compileStatement: async()=>{
    throw new Error('compileStatement() is not supported by this adapter.');
  },

});
