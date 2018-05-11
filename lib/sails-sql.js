/**
 * Module dependencies
 */

var util = require('util');
var url = require('url');
var _ = require('@sailshq/lodash');
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
  createManager: async({connectionString, onUnexpectedFailure, meta})=>{
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


    // Build a local variable (`_mysqlClientConfig`) to house a dictionary
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
    var _mysqlClientConfig = {};


    // Validate and parse `meta` (if specified).
    if (meta !== undefined && !_.isObject(meta)) { throw new Error('If provided, `meta` must be a dictionary.'); }
    //^^TODO: pull that into the `custom` function on the input def in `driver-interface`
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
          _mysqlClientConfig[mysqlClientConfKeyName] = meta[mysqlClientConfKeyName];
        }
      });//∞
    }//ﬁ


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
      // TODO: bring in fancier version of this code (believe it's in sails-mysql)
      if (parsedConnectionStr.port) {
        _mysqlClientConfig.port = +parsedConnectionStr.port;
      } else {
        _mysqlClientConfig.port = DEFAULT_PORT;
      }

      if (parsedConnectionStr.hostname) {
        _mysqlClientConfig.host = parsedConnectionStr.hostname;
      } else {
        _mysqlClientConfig.host = DEFAULT_HOST;
      }

      // Parse user & password
      if (parsedConnectionStr.auth && _.isString(parsedConnectionStr.auth)) {
        var authPieces = parsedConnectionStr.auth.split(/:/);
        if (authPieces[0]) {
          _mysqlClientConfig.user = authPieces[0];
        }
        if (authPieces[1]) {
          _mysqlClientConfig.password = authPieces[1];
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
          _mysqlClientConfig.database = _databaseName;
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
    var pool = felix.createPool(_mysqlClientConfig);

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

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // destroyManager: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // getConnection: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // releaseConnection: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // verifyModelDef: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // createRecord: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // createEachRecord: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // updateRecords: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // destroyRecords: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // findRecords: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // countRecords: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // sumRecords: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // avgRecords: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // definePhysicalModel: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // dropPhysicalModel: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // setPhysicalSequence: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // sendNativeQuery: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // beginTransaction: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // commitTransaction: async({TODO, meta})=>{
  //   // TODO
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // rollbackTransaction: async({TODO, meta})=>{
  //   // TODO
  // },

});
