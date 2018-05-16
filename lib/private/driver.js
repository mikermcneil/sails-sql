/**
 * Module dependencies
 */

var url = require('url');
var _ = require('@sailshq/lodash');
// var debug = require('debug')('query');
var flaverr = require('flaverr');
var getIsValidConnection = require('./get-is-valid-connection');
var getLibrary = (dialect)=>{
  switch (dialect) {
    case 'mysql': return require('mysql');
    case 'pg': return require('pg');
    case 'mssql': return require('mssql');
    case 'oracledb': return require('oracledb');
    case 'sqlite3': return require('sqlite3');
    default: throw new Error('Unsupported dialect');
  }
};//ƒ




/**
 * Raw driver fns, keyed by method name.
 *
 * @type {Dictionary}
 */
var DRIVER = {

  //   ██████╗ ██████╗ ███╗   ██╗███╗   ██╗███████╗ ██████╗████████╗ █████╗ ██████╗ ██╗     ███████╗
  //  ██╔════╝██╔═══██╗████╗  ██║████╗  ██║██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║     ██╔════╝
  //  ██║     ██║   ██║██╔██╗ ██║██╔██╗ ██║█████╗  ██║        ██║   ███████║██████╔╝██║     █████╗
  //  ██║     ██║   ██║██║╚██╗██║██║╚██╗██║██╔══╝  ██║        ██║   ██╔══██║██╔══██╗██║     ██╔══╝
  //  ╚██████╗╚██████╔╝██║ ╚████║██║ ╚████║███████╗╚██████╗   ██║   ██║  ██║██████╔╝███████╗███████╗
  //   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝ ╚═════╝   ╚═╝   ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝
  //
  /**
   * @see http://npmjs.com/package/driver-interface
   *
   * Note: For this driver, a manager must always expose it `dialect`.
   */
  createManager: async function({connectionString, onUnexpectedFailure, meta}) {

    var dialect = 'mysql';//«TODO: actually determine this from connection URL protocol:// or from `meta`
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // switch ('mysql') {
    //         case 'mysql':
    // break;
    //         default: reject(new Error('Unsupported dialect'));
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // Validate and parse `meta` (if specified).
    // Supported options are explicitly whitelisted below (per dialect).
    var _underlyingDbClientConfig = {};
    if (meta) {
      // MySQL Client Options:  (will be passed into `.createPool()`)
      //  [?] https://github.com/mysqljs/mysql/blob/v2.15.0/Readme.md#connection-options
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
      let urlToParse = connectionString;
      // We don't actually care about the protocol, but `url.parse()` returns funky results
      // if the argument doesn't have one.  So we'll add one if necessary.
      // See https://en.wikipedia.org/wiki/Uniform_Resource_Identifier#Syntax
      if (!urlToParse.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
        urlToParse = 'mysql://' + urlToParse;
      }
      let parsedConnectionStr = url.parse(urlToParse);

      // Parse port & host
      let DEFAULT_HOST = 'localhost';
      let DEFAULT_PORT = 3306;
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
        let authPieces = parsedConnectionStr.auth.split(/:/);
        if (authPieces[0]) {
          _underlyingDbClientConfig.user = authPieces[0];
        }
        if (authPieces[1]) {
          _underlyingDbClientConfig.password = authPieces[1];
        }
      }

      // Parse database name
      if (_.isString(parsedConnectionStr.pathname)) {
        let _databaseName = parsedConnectionStr.pathname;
        // Trim leading and trailing slashes
        _databaseName = _databaseName.replace(/^\/+/, '');
        _databaseName = _databaseName.replace(/\/+$/, '');
        // If anything is left, use it as the database name.
        if (_databaseName) {
          _underlyingDbClientConfig.database = _databaseName;
        }
      }
    } catch (err) {
      let error = flaverr({
        message: `Provided value (${connectionString}) is not a valid MySQL connection string.  ${err.message}`
      }, err);
      let report = { error, meta };
      throw {malformed: report};
    }

    var mysql = getLibrary(dialect);

    // Create a connection pool.
    //
    // More about using pools with node-mysql:
    //  • https://github.com/mysqljs/mysql/blob/v2.15.0/Readme.md#pooling-connections
    var pool = mysql.createPool(_underlyingDbClientConfig);

    // Bind an "error" handler in order to handle errors from connections in the pool,
    // or from the pool itself. Otherwise, without any further protection, if any MySQL
    // connections in the pool die, then the process would crash with an error.
    //
    // For more background, see:
    //  • https://github.com/mysqljs/mysql/blob/v2.15.0/Readme.md#error-handling
    pool.on('error', (err)=>{
      // When/if something goes wrong in this pool, call the `onUnexpectedFailure` notifier
      // (if one was provided)
      if (onUnexpectedFailure) {
        let message = `One or more pooled connections to MySQL database were lost. Did the database server go offline?  ${(err?err.message:'')}`;
        if (err) {
          err = flaverr({ raw: err, message }, err);
        } else {
          err = new Error(message);
        }//ﬁ
        onUnexpectedFailure(err);
      }//ﬁ
    });//œ

    // Finally, build and return the manager.
    return {
      manager: { pool, connectionString, dialect },
      meta
    };
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  destroyManager: async function({manager, meta}) {

    switch (manager.dialect) {
      case 'mysql':
        return new Promise((resolve, reject)=>{
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
        });//•_∏_
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   *
   * > Note: For this driver, a connection must always expose its `dialect`.
   */
  getConnection: async function({manager, meta}) {

    switch (manager.dialect) {
      case 'mysql':
        return new Promise((resolve, reject)=>{
          manager.pool.getConnection((err, connection)=>{
            // NOTE: If you are pooling, `connection` will have a `.release()` method,
            // AND/OR if you are not pooling, it will have an `.end()` method.
            if (err) {
              let error = flaverr({
                message: 'Failed to obtain a MySQL database connection from the pool.  '+err.message
              }, err);
              let report = { error, meta };
              reject({failed: report});
            } else {
              connection.dialect = manager.dialect;
              resolve({ connection, meta });
            }
          });//_∏_
        });//•_∏_
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   *
   * > Note: below we first check some basic assertions about the provided connection.
   * > (this doesn't guarantee it's still active or anything, but it does let
   * > us know that it at least _HAS_ the properly formatted methods and properties
   * > necessary for internal use in this Waterline driver)
   */
  releaseConnection: async function({connection, meta}) {


    // Validate connection
    if (!getIsValidConnection(connection)) {
      let report = { meta };
      throw {badConnection: report};
    }//•

    // Since it's legit, go ahead and release it
    switch (connection.dialect) {
      case 'mysql':
        try {
          connection.release();
        } catch (errFrom1stAttempt) {
          try {
            connection.destroy();
          } catch (errFrom2ndAttempt) {
            throw flaverr({
              errFrom1stAttempt,
              message: 'Could not release MySQL connection gracefully due to an error '+
              '(see `.errFrom1stAttempt`), and attempting to forcibly destroy '+
              'the connection encountered an error as well: '+errFrom2ndAttempt.message
            }, errFrom2ndAttempt);
          }
        }

        return ({ meta });//«IWMIH, we got rid of the connection, one way or another

      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },


  //   ██████╗ ██╗   ██╗███████╗██████╗ ██╗   ██╗ █████╗ ██████╗ ██╗     ███████╗
  //  ██╔═══██╗██║   ██║██╔════╝██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗██║     ██╔════╝
  //  ██║   ██║██║   ██║█████╗  ██████╔╝ ╚████╔╝ ███████║██████╔╝██║     █████╗
  //  ██║▄▄ ██║██║   ██║██╔══╝  ██╔══██╗  ╚██╔╝  ██╔══██║██╔══██╗██║     ██╔══╝
  //  ╚██████╔╝╚██████╔╝███████╗██║  ██║   ██║   ██║  ██║██████╔╝███████╗███████╗
  //   ╚══▀▀═╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝
  //
  /**
   * @see http://npmjs.com/package/driver-interface
   */
  sendNativeQuery: async function({connection, nativeQuery, valuesToEscape, meta}) {
    if (!getIsValidConnection(connection)) {
      throw {badConnection: {meta}};
    }//•

    // TODO: Attach `dialect` to error that comes back from `queryFailed` exit

    switch (connection.dialect) {
      case 'mysql':
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        // Note: This implementation is based on the original mp-mysql package.
        // For notes and reasoning from that earlier rendition, check out:
        // https://github.com/sailshq/machinepack-mysql/blob/98f90ce07928163cde956fdf43c6d27534175233/lib/send-native-query.js#L150-L325
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   *
   * > For more information on error footprints, check out:
   * > https://github.com/node-machine/waterline-driver-interface#footprints
   */
  parseNativeQueryError: async function({nativeQueryError, meta}) {

    if (!_.isObject(nativeQueryError)) {
      let footprint = { identity: 'catchall '};
      return { footprint, meta };
    }//•

    switch (nativeQueryError.dialect) {
      case 'mysql':
        let footprint;
        if (nativeQueryError.code === 'ER_DUP_ENTRY') {
          // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
          // `code`  : 'ER_DUP_ENTRY'
          // `errno`  : 1062
          // `sqlState`  : '23000'
          // `index`  : 0
          //
          //   -- Recognized as the `notUnique` footprint from the
          //      Waterline driver spec.  If additional information
          //      is needed in userland beyond what is guaranteed in
          //      the spec, then you should take advantage of `meta`.
          // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
          footprint = { identity: 'notUnique', keys: [] };
          // Now build our footprint's `keys` property by manually parsing the MySQL error message and extracting the relevant bits.
          // (See also: https://github.com/balderdashy/sails-mysql/blob/2c414f1191c3595df2cea8e40259811eb3ca05f9/lib/adapter.js#L1223)
          if (_.isString(nativeQueryError.message)) {
            var matches = nativeQueryError.message.match(/Duplicate entry '.*' for key '(.*?)'$/);
            if (matches && matches.length > 0) {
              footprint.keys.push(matches[1]);
            }
          }
        } else if (nativeQueryError.code === 'ER_NO_SUCH_TABLE') {
          // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
          // `code`  : 'ER_NO_SUCH_TABLE'
          // `errno`  : 1146
          // `sqlState`  : '42S02'
          // `index`  : 0
          //
          //   -- This footprint not in the specification yet; this driver
          //      is ahead of the spec.
          // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
          footprint = { identity: 'noSuchPhysicalModel' };
        } else if (nativeQueryError.code === 'ER_PARSE_ERROR') {
          // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
          // `code`  : 'ER_PARSE_ERROR'
          // `errno`  : 1064
          // `sqlState`  : '42000'
          // `index`  : 0
          //
          //   -- This footprint not in the specification yet; this driver
          //      is ahead of the spec.
          // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
          footprint = { identity: 'couldNotParseNativeQuery' };
        } else {
          footprint = { identity: 'catchall' };
        }//ﬁ

        return { footprint, meta };

      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  //  ████████╗██████╗  █████╗ ███╗   ██╗███████╗ █████╗  ██████╗████████╗██╗ ██████╗ ███╗   ██╗ █████╗ ██╗
  //  ╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔══██╗██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║██╔══██╗██║
  //     ██║   ██████╔╝███████║██╔██╗ ██║███████╗███████║██║        ██║   ██║██║   ██║██╔██╗ ██║███████║██║
  //     ██║   ██╔══██╗██╔══██║██║╚██╗██║╚════██║██╔══██║██║        ██║   ██║██║   ██║██║╚██╗██║██╔══██║██║
  //     ██║   ██║  ██║██║  ██║██║ ╚████║███████║██║  ██║╚██████╗   ██║   ██║╚██████╔╝██║ ╚████║██║  ██║███████╗
  //     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝
  //

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  beginTransaction: async function({connection, meta}) {
    if (!getIsValidConnection(connection)) {
      let report = {meta};
      throw {badConnection: report};
    }//•

    switch (connection.dialect) {
      case 'mysql':
      case 'pg':
      case 'mssql':
      case 'sqlite3':
        return await DRIVER.sendNativeQuery({
          nativeQuery: 'BEGIN',
          connection,
          meta
        });
        //•
      case 'oracledb':
        // For oracle, use START TRANACTION instead, because "BEGIN" has the
        // side-effect of causing auto-commit mode to become a thing
        return await DRIVER.sendNativeQuery({
          nativeQuery: 'START TRANSACTION',
          connection,
          meta
        });//•
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  commitTransaction: async function({connection, meta}) {
    if (!getIsValidConnection(connection)) {
      let report = {meta};
      throw {badConnection: report};
    }//•

    switch (connection.dialect) {
      case 'mysql':
      case 'pg':
      case 'mssql':
      case 'oracledb':
      case 'sqlite3':
        return await DRIVER.sendNativeQuery({
          nativeQuery: 'COMMIT',
          connection,
          meta
        });
        //•
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  rollbackTransaction: async function({connection, meta}) {
    if (!getIsValidConnection(connection)) {
      let report = {meta};
      throw {badConnection: report};
    }//•

    switch (connection.dialect) {
      case 'mysql':
      case 'pg':
      case 'mssql':
      case 'oracledb':
      case 'sqlite3':
        return await DRIVER.sendNativeQuery({
          nativeQuery: 'ROLLBACK',
          connection,
          meta
        });
        //•
      default: throw new Error('Unsupported dialect');
    }
  },


  // //  ███╗   ███╗ ██████╗ ██████╗ ███████╗██╗     ███████╗██████╗
  // //  ████╗ ████║██╔═══██╗██╔══██╗██╔════╝██║     ██╔════╝██╔══██╗
  // //  ██╔████╔██║██║   ██║██║  ██║█████╗  ██║     █████╗  ██║  ██║
  // //  ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝  ██║     ██╔══╝  ██║  ██║
  // //  ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗███████╗███████╗██████╔╝
  // //  ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚══════╝╚═════╝
  // //

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // verifyModelDef: async function({modelDef}) {
  //   if (!this.dialect) {
  //     throw new Error(
  //       'To use verifyModelDef() with this package, it must be invoked with its SQL dialect declared under the `dialect` meta key.  '+
  //       'For example: `await verifyModelDef(WLModel).meta({dialect: \'mysql\'});`'
  //     );
  //   }
  //   switch (this.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // createRecord: async function({query, connection, dryOrm}) {
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // createEachRecord: async function({query, connection, dryOrm}) {
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // updateRecords: async function({query, connection, dryOrm}) {
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // destroyRecords: async function({query, connection, dryOrm}) {
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // findRecords: async function({query, connection, dryOrm}) {
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // countRecords: async function({query, connection, dryOrm}) {
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // sumRecords: async function({query, connection, dryOrm}) {
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // avgRecords: async function({query, connection, dryOrm}) {
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },


  // //  ███╗   ███╗██╗ ██████╗ ██████╗  █████╗ ████████╗███████╗ █████╗ ██████╗ ██╗     ███████╗
  // //  ████╗ ████║██║██╔════╝ ██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██╔══██╗██╔══██╗██║     ██╔════╝
  // //  ██╔████╔██║██║██║  ███╗██████╔╝███████║   ██║   █████╗  ███████║██████╔╝██║     █████╗
  // //  ██║╚██╔╝██║██║██║   ██║██╔══██╗██╔══██║   ██║   ██╔══╝  ██╔══██║██╔══██╗██║     ██╔══╝
  // //  ██║ ╚═╝ ██║██║╚██████╔╝██║  ██║██║  ██║   ██║   ███████╗██║  ██║██████╔╝███████╗███████╗
  // //  ╚═╝     ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝
  // //

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // definePhysicalModel: async function({connection, TODO, meta}) {
  //   // TODO: See how sails-mongo does it: https://github.com/balderdashy/sails-mongo/blob/2816d81359a5846550c90bd1dbfa98967ac13786/lib/private/machines/define-physical-model.js
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // dropPhysicalModel: async function({connection, TODO, meta}) {
  //   // TODO: See how sails-mongo does it: https://github.com/balderdashy/sails-mongo/blob/2816d81359a5846550c90bd1dbfa98967ac13786/lib/private/machines/define-physical-model.js
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // setPhysicalSequence: async function({connection, TODO, meta}) {
  //   // TODO: See how sails-mongo does it: https://github.com/balderdashy/sails-mongo/blob/2816d81359a5846550c90bd1dbfa98967ac13786/lib/private/machines/define-physical-model.js
  //   switch (connection.dialect) {
  //     case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
  //     default: throw new Error('Unsupported dialect');
  //   }
  // },




  // ///////////////////////////////////////////////////////////////////////////////////////
  // //  ██████╗ ███████╗██████╗ ██████╗ ███████╗ ██████╗ █████╗ ████████╗███████╗██████╗
  // //  ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╔══██╗
  // //  ██║  ██║█████╗  ██████╔╝██████╔╝█████╗  ██║     ███████║   ██║   █████╗  ██║  ██║
  // //  ██║  ██║██╔══╝  ██╔═══╝ ██╔══██╗██╔══╝  ██║     ██╔══██║   ██║   ██╔══╝  ██║  ██║
  // //  ██████╔╝███████╗██║     ██║  ██║███████╗╚██████╗██║  ██║   ██║   ███████╗██████╔╝
  // //  ╚═════╝ ╚══════╝╚═╝     ╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═════╝
  // //  DEPRECATED METHODS:
  // ///////////////////////////////////////////////////////////////////////////////////////

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // parseNativeQueryResult: async()=>{
  //   throw new Error('parseNativeQueryResult() is not supported by this adapter.');
  // },

  // /**
  //  * @see http://npmjs.com/package/driver-interface
  //  */
  // compileStatement: async()=>{
  //   throw new Error('compileStatement() is not supported by this adapter.');
  // },

};


/**
 * Export driver
 * @type {Dictionary}
 */
module.exports = DRIVER;
