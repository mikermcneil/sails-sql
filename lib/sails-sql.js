/**
 * Module dependencies
 */

var util = require('util');
var url = require('url');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var parley = require('parley');
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

    // Note:
    // Support for different types of managers is database-specific, and is not
    // built into the Waterline driver spec-- however this type of configurability
    // can be instrumented using `meta`.
    //
    // In particular, support for ad-hoc connections (i.e. no pool) and clusters/multiple
    // pools (see "PoolCluster": https://github.com/felixge/node-mysql/blob/v2.10.2/Readme.md#poolcluster)
    // could be implemented here, using properties on `meta` to determine whether or not
    // to have this manager produce connections ad-hoc, from a pool, or from a cluster of pools.
    //
    // Feel free to fork this driver and customize as you see fit.  Also note that
    // contributions to the core driver in this area are welcome and greatly appreciated!

    // Build a local variable (`_underlyingDbClientConfig`) to house a dictionary
    // of additional MySQL options that will be passed into `.createPool()`
    // (Note that these could also be used with `.connect()` or `.createPoolCluster()`)
    //
    // This is pulled from the `connectionString` and `meta` inputs, and used for
    // configuring stuff like `host` and `password`.
    //
    // For a complete list of available options, see:
    //  • https://github.com/felixge/node-mysql#connection-options
    //
    // However, note that supported options are explicitly whitelisted below.
    var _underlyingDbClientConfig = {};

    // Validate and parse `meta` (if specified).
    if (meta) {

      // Use properties of `meta` directly as MySQL client config.
      // (note that we're very careful to only stick a property on the client config
      //  if it was not undefined, just in case that matters)
      //
      // > In the future, other special properties of `meta` could be used
      // > as options for the manager-- e.g. whether or not to use pooling,
      // > or the connection strings of replicas, etc.
      [
        // MySQL Client Options:
        // ============================================

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

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // TODO: negotiate dialect
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

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
    } catch (_e) {
      _e.message = util.format('Provided value (`%s`) is not a valid MySQL connection string.', connectionString) + ' Error details: ' + _e.message;
      throw {malformed: {error: _e, meta: meta}};
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

    // Note that if this driver is adapted to support managers which spawn
    // ad-hoc connections or manage multiple pools/replicas using PoolCluster,
    // then relevant settings would need to be included in the manager instance
    // so that the manager could be appropriately destroyed here (in the case of
    // ad-hoc connections, leased connections would need to be tracked on the
    // manager, and then rounded up and disconnected here.)
    //
    // For now, since we only support a single pool, we simply destroy it.
    //
    // For more info, see:
    //  • https://github.com/felixge/node-mysql/blob/v2.10.2/Readme.md#closing-all-the-connections-in-a-pool
    return await parley((proceed)=>{
      manager.pool.end((err)=>{
        if (err) {
          return proceed(flaverr({
            code: 'E_FAILED',
            raw: err
          }, new Error('Failed to destroy the MySQL connection pool and/or gracefully end all connections in the pool.')));
        } else {
          // All connections in the pool have ended.
          return proceed(undefined, { meta });
        }
      });//_∏_
    })
    .intercept('E_FAILED', (err)=>( {failed: {error:err, meta}} ));
  },

  /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // getConnection: async function({TODO, meta}) {
  //   // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //   // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
  //   // to take advantage of runner's natural support for this through `.meta()`
  //   // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // releaseConnection: async function({TODO, meta}) {
  //   // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //   // ^^FUTURE: Breaking change: Instead of `meta` as input, use `this` context
  //   // to take advantage of runner's natural support for this through `.meta()`
  //   // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //   // TODO
  // },

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
