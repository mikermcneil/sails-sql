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
  createManager: async function({connectionString, onUnexpectedFailure, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`

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
  destroyManager: async function({manager, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`

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
  getConnection: async function({manager, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`

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
  releaseConnection: async function({connection, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`


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
  sendNativeQuery: async function({connection, nativeQuery, valuesToEscape, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`
    if (!getIsValidConnection(connection)) {
      throw {badConnection: {meta}};
    }//•

    switch (connection.dialect) {
      case 'mysql':

        // TODO: Attach `dialect` property to Error sent through queryFailed exit
        throw new Error('Support for that dialect is incomplete...  (TODO)');
        // // Validate provided native query.
        // var sql = inputs.nativeQuery;
        // var bindings = inputs.valuesToEscape || [];
        // var queryInfo;


        // debug('Running SQL Query:');
        // debug('SQL: ' + sql);
        // debug('Bindings: ' + bindings);
        // debug('Connection Id: ' + inputs.connection.id);

        // // If the meta flag is defined and it has a flag titled `isUsingQuestionMarks`
        // // then the query was generated by Knex in compileStatement and the query
        // // string is using `?` in place of values rather than the Waterline standardized
        // // $1, $2, etc.
        // if (!inputs.meta || !inputs.meta.isUsingQuestionMarks) {
        //   // Process SQL template, escaping bindings.
        //   // This converts `$1`, `$2`, etc. into the escaped binding.
        //   sql = sql.replace(/\$[1-9][0-9]*/g, function (substr){

        //     // e.g. `'$3'` => `'3'` => `3` => `2`
        //     var idx = +( substr.slice(1) ) - 1;

        //     // If no such binding exists, then just leave the original
        //     // template string (e.g. "$3") alone.
        //     if (idx >= bindings.length) {
        //       return substr;
        //     }

        //     // But otherwise, replace it with the escaped binding.
        //     return inputs.connection.escape(bindings[idx]);
        //   });

        //   // In this case the query has the values inline.
        //   queryInfo = sql;
        // } else {
        //   queryInfo = {
        //     sql: sql,
        //     values: bindings
        //   };
        // }

        // debug('Compiled (final) SQL: ' + sql);

        // // Send native query to the database using node-mysql.
        // inputs.connection.query(queryInfo, function query() {
        //   // The exact format of the arguments for this callback are not part of
        //   // the officially documented behavior of node-mysql (at least not as
        //   // of March 2016 when this comment is being written).
        //   //
        //   // If you need to trace this down to the implementation, you might try
        //   // checking out the following links in order (from top to bottom):
        //   //  • https://github.com/felixge/node-mysql#performing-queries
        //   //  • https://github.com/felixge/node-mysql/blob/f5bd13d8c54ce524a6bff48bfceb15fdca3a938a/lib/protocol/ResultSet.js
        //   //  • https://github.com/felixge/node-mysql/blob/d4a5fd7b5e92a1e09bf3c85d24265eada8a84ad8/lib/protocol/sequences/Sequence.js#L96
        //   //  • https://github.com/felixge/node-mysql/blob/1720920f7afc660d37430c35c7128b20f77735e3/lib/protocol/sequences/Query.js#L94
        //   //  • https://github.com/felixge/node-mysql/blob/1720920f7afc660d37430c35c7128b20f77735e3/lib/protocol/sequences/Query.js#L144
        //   //
        //   // For example, here are the raw arguments provided to the `.query()`
        //   // callback for different types of queries:
        //   // ====================================================================
        //   // * * * * * *
        //   // CREATE TABLE
        //   // * * * * * *
        //   // ```
        //   // null,
        //   // {         // an OkPacket instance
        //   //   fieldCount: 0,
        //   //   affectedRows: 0,
        //   //   insertId: 0,
        //   //   serverStatus: 2,
        //   //   warningCount: 0,
        //   //   message: '',
        //   //   protocol41: true,
        //   //   changedRows: 0
        //   // },
        //   // undefined
        //   // ```
        //   //
        //   // * * * * * *
        //   // SELECT
        //   // * * * * * *
        //   // ```
        //   // null,
        //   // [        // an array of `RowDataPacket` instances:
        //   //   {
        //   //     id: 1,
        //   //     CustomerName: 'Cardinal',
        //   //     ...
        //   //   },
        //   //   ...
        //   // ],
        //   // [        // an array of `FieldPacket` instances:
        //   //   {
        //   //     catalog: 'def',
        //   //     db: 'mikermcneil',
        //   //     table: 'some_table',
        //   //     orgTable: 'some_table',
        //   //     name: 'id',
        //   //     orgName: 'id',
        //   //     charsetNr: 33,
        //   //     length: 765,
        //   //     type: 253,
        //   //     flags: 20483,
        //   //     decimals: 0,
        //   //     default: undefined,
        //   //     zeroFill: false,
        //   //     protocol41: true
        //   //   },
        //   //   ...
        //   // ]
        //   // ```
        //   //
        //   // * * * * * *
        //   // INSERT
        //   // * * * * * *
        //   // ```
        //   // null,
        //   // {             // an OkPacket instance
        //   //   fieldCount: 0,
        //   //   affectedRows: 1,
        //   //   insertId: 1,
        //   //   serverStatus: 2,
        //   //   warningCount: 0,
        //   //   message: '',
        //   //   protocol41: true,
        //   //   changedRows: 0
        //   // },
        //   // undefined
        //   // ```
        //   //
        //   // * * * * * *
        //   // DELETE
        //   // * * * * * *
        //   // ```
        //   // null,
        //   // {         // an OkPacket instance
        //   //   fieldCount: 0,
        //   //   affectedRows: 1,
        //   //   insertId: 0,
        //   //   serverStatus: 34,
        //   //   warningCount: 0,
        //   //   message: '',
        //   //   protocol41: true,
        //   //   changedRows: 0
        //   // },
        //   // undefined
        //   // ```
        //   // * * * * * *
        //   // UPDATE
        //   // * * * * * *
        //   // ```
        //   // null,
        //   // {         // an OkPacket instance
        //   //   fieldCount: 0,
        //   //   affectedRows: 1,
        //   //   insertId: 0,
        //   //   serverStatus: 34,
        //   //   warningCount: 0,
        //   //   message: '(Rows matched: 1  Changed: 1  Warnings: 0',
        //   //   protocol41: true,
        //   //   changedRows: 1
        //   // },
        //   // undefined
        //   // ```
        //   // ====================================================================


        //   // If the first argument is truthy, then treat it as an error.
        //   // (i.e. close shop early &gtfo; via the `queryFailed` exit)
        //   if (arguments[0]) {
        //     return exits.queryFailed({
        //       error: arguments[0],
        //       meta: inputs.meta
        //     });
        //   }


        //   // Otherwise, the query was successful.

        //   // Since the arguments passed to this callback and their data format
        //   // can vary across different types of queries, we do our best to normalize
        //   // that here.  However, in order to do so, we have to be somewhat
        //   // opinionated; i.e. using the following heuristics when building the
        //   // standard `result` dictionary:
        //   //  • If the 2nd arg is an array, we expose it as `result.rows`.
        //   //  • Otherwise if the 2nd arg is a dictionary, we expose it as `result`.
        //   //  • If the 3rd arg is an array, we include it as `result.fields`.
        //   //    (if the 3rd arg is an array AND the 2nd arg is a dictionary, then
        //   //     the 3rd arg is tacked on as the `fields` property of the 2nd arg.
        //   //     If the 2nd arg already had `fields`, it is overridden.)
        //   var normalizedNativeResult;
        //   if (arguments[1]) {
        //     // `result :=`
        //     // `result.rows :=`
        //     if (_.isArray(arguments[1])) {
        //       normalizedNativeResult = { rows: arguments[1] };

        //       // `result :=`
        //     } else if (_.isObject(arguments[1])) {
        //       normalizedNativeResult = arguments[1];
        //     } else {
        //       return exits.error(new Error('Query was successful, but output from node-mysql is in an unrecognized format.  Output:\n' + util.inspect(Array.prototype.slice.call(arguments), { depth: null })));
        //     }
        //   }

        //   if (arguments[2]) {
        //     // `result.fields :=`
        //     if (_.isArray(arguments[2])) {
        //       normalizedNativeResult.fields = arguments[2];
        //     } else {
        //       return exits.error(new Error('Query was successful, but output from node-mysql is in an unrecognized format.  Output:\n' + util.inspect(Array.prototype.slice.call(arguments), { depth: null })));
        //     }
        //   }

        //   // Finally, return the normalized result.
        //   return exits.success({
        //     result: normalizedNativeResult,
        //     meta: inputs.meta
        //   });
        // });
        // break;

      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  parseNativeQueryError: async function({nativeQueryError, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`
    switch (nativeQueryError.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  beginTransaction: async function({connection, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`
    if (!getIsValidConnection(connection)) {
      let report = {meta};
      throw {badConnection: report};
    }//•

    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  commitTransaction: async function({connection, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`
    if (!getIsValidConnection(connection)) {
      let report = {meta};
      throw {badConnection: report};
    }//•

    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  rollbackTransaction: async function({connection, meta}) {//« FUTURE: Breaking change: Instead of `meta` as input, use `this` context to take advantage of runner's natural support for this through `.meta()`
    if (!getIsValidConnection(connection)) {
      let report = {meta};
      throw {badConnection: report};
    }//•

    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },


  //  ███╗   ███╗ ██████╗ ██████╗ ███████╗██╗     ███████╗██████╗
  //  ████╗ ████║██╔═══██╗██╔══██╗██╔════╝██║     ██╔════╝██╔══██╗
  //  ██╔████╔██║██║   ██║██║  ██║█████╗  ██║     █████╗  ██║  ██║
  //  ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝  ██║     ██╔══╝  ██║  ██║
  //  ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗███████╗███████╗██████╔╝
  //  ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚══════╝╚═════╝
  //

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  verifyModelDef: async function({modelDef}) {
    var meta = this;
    if (!meta.dialect) {
      throw new Error('To use verifyModelDef() with this package, it must be invoked with its dialect declared under the `dialect` meta key-- for example: `await verifyModelDef(WLModel).meta({dialect: \'mysql\'});`');
    }
    switch (meta.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  createRecord: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  createEachRecord: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  updateRecords: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  destroyRecords: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  findRecords: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  countRecords: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  sumRecords: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  avgRecords: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },


  //  ███╗   ███╗██╗ ██████╗ ██████╗  █████╗ ████████╗███████╗ █████╗ ██████╗ ██╗     ███████╗
  //  ████╗ ████║██║██╔════╝ ██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██╔══██╗██╔══██╗██║     ██╔════╝
  //  ██╔████╔██║██║██║  ███╗██████╔╝███████║   ██║   █████╗  ███████║██████╔╝██║     █████╗
  //  ██║╚██╔╝██║██║██║   ██║██╔══██╗██╔══██║   ██║   ██╔══╝  ██╔══██║██╔══██╗██║     ██╔══╝
  //  ██║ ╚═╝ ██║██║╚██████╔╝██║  ██║██║  ██║   ██║   ███████╗██║  ██║██████╔╝███████╗███████╗
  //  ╚═╝     ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝
  //

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  definePhysicalModel: async function({connection, TODO, meta}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  dropPhysicalModel: async function({connection, TODO, meta}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  setPhysicalSequence: async function({connection, TODO, meta}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
      default: throw new Error('Unsupported dialect');
    }
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

};


/**
 * Export driver
 * @type {Dictionary}
 */
module.exports = DRIVER;
