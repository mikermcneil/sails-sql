/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var WLUtils = require('waterline-utils');
var initializeKnex = require('./initialize-knex');
var getIsValidConnection = require('./get-is-valid-connection');
var reifyPhysicalValuesToSet = require('./reify-physical-values-to-set');
var processNativeRecords = require('./process-native-records');
var compileWhereClauseIntoKnexChain = require('./compile-where-clause-into-knex-chain');
var runNativeQuery = require('./run-native-query');
var requireDbLibrary = (dialect)=>{
  switch (dialect) {
    case 'mysql':
      return require('mysql');
    // case 'pg':
    //   return require('pg');  // ("pg": "7.4.3")
    case 'mssql':
      // Note: only one query can be handled at a time per connection in MSSQL.
      // But rather than changing the implementation so far to map our concept
      // of a "connection" to a connection pool-- with some extra stuff to handle
      // transactions (because they still actually _do_ need to be run
      // on a single connection), we'll just expect userland code to know that
      // about their database.  This allows for connection leasing to work as
      // intended, even if the exact semantics are skinned a little differently
      // for this database.
      //
      // References:
      //   • http://tediousjs.github.io/tedious/api-connection.html#function_beginTransaction
      //   • http://tediousjs.github.io/tedious/api-request.html
      //   • https://github.com/tediousjs/node-mssql/blob/c05b5bb07f87241f2f2cf14ea9c36c0659061f72/lib/base.js#L99-L318
      return require('tedious');
    // case 'oracledb':
      // e.g.
      // return require('oracledb'); // ("oracledb": "2.2.0")
    // case 'sqlite3':
      // e.g.
      // return require('sqlite3'); // ("sqlite3": "4.0.0")
    default: throw new Error(`Unsupported dialect "${dialect}"`);
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
   * @see https://github.com/node-machine/driver-interface/blob/master/layers/connectable/create-manager.js
   * @see http://npmjs.com/package/driver-interface
   *
   * Note: For this driver, a manager must always expose its `dialect`.
   *
   * @meta {String?} dialect          [a specific dialect to use -- if specified, this will be used instead of the dialect inferred from the url]
   * @meta {Ref?} dbLibrary           [a specific database library to use -- otherwise sails-sql will use the default library and version for this dialect]
   * @meta {String?} protocolPrefix   [**FOR INTERNAL USE ONLY** (provides an optimization to prevent unnecessarily inferring the dialect, host, user, password, etc. from the connection URL more than once)]
   */
  createManager: async function({connectionString, onUnexpectedFailure, meta}) {
    if (!meta) { meta = {}; }

    // Allow for direct use -- validate + normalize `meta` if it doesn't already
    // have a truthy "protocolPrefix" property defined.
    if (!meta.protocolPrefix) {
      let tmpDsConfig = _.extend({}, meta, { url: connectionString });
      WLUtils.normalizeDatastoreConfig(tmpDsConfig);
      delete tmpDsConfig.url;
      _.extend(meta, tmpDsConfig);
    }

    // Determine dialect, handling aliases and case-folding.
    var dialect = meta.dialect || meta.protocolPrefix;
    if (!dialect) { throw {malformed: { error: new Error('Could not determine SQL dialect to use.  Please specify a dialect via the connection URL protocol (e.g. "mysql://").'), meta }}; }
    switch (dialect.toLowerCase()) {
      case 'mysql':                                   dialect = 'mysql';    break;
      case 'postgresql': case 'postgres': case 'pg':  dialect = 'pg';       break;
      case 'mssql': case 'sqlserver':                 dialect = 'mssql';    break;
      case 'oracledb': case 'oracle':                 dialect = 'oracledb'; break;
      case 'sqlite3': case 'sqlite':                  dialect = 'sqlite3';  break;
      default: throw {malformed: { error: new Error(`Unrecognized SQL dialect ${dialect}.  Please specify a supported dialect instead; e.g. "mysql", "pg", "mssql", "oracledb", or "sqlite3".`), meta }};
    }

    var dbLibrary = meta.dbLibrary || requireDbLibrary(dialect);
    var underlyingDbLibraryConfig = _.omit(meta, ['dialect', 'dbLibrary']);
    // Note: Since we're allowing whatever through `meta`, stuff like
    // MySQL's `socketPath` is automatically supported.  In the context of a
    // Sails app, `meta` means miscellaneous properties on the datastore config.
    // > See https://github.com/sailshq/machinepack-mysql/pull/11

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Note about handling unexpected failures:
    // Below, we almost always bind an "error" handler in order to handle errors
    // from connections in the pool, or from the pool itself. Otherwise, without
    // any further protection, if any database connections in the pool die, then
    // the process would crash with an error.
    //
    // Specifically, when/if something goes wrong in this pool, we call the
    // `onUnexpectedFailure` notifier function (if it was provided).
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    if (dialect === 'mysql') {
      // Create a connection pool.
      //
      // More about using pools with node-mysql:
      //  • https://github.com/mysqljs/mysql/blob/v2.15.0/Readme.md#pooling-connections
      let pool = dbLibrary.createPool(underlyingDbLibraryConfig);

      // Handle unexpected failures (note that we bind the event handler, no matter what.)
      // For more background, see:
      //  • https://github.com/mysqljs/mysql/blob/v2.15.0/Readme.md#error-handling
      pool.on('error', (err)=>{
        // When/if something goes wrong in this pool, call the `onUnexpectedFailure` notifier
        // (if one was provided)
        if (onUnexpectedFailure) {
          let message = `One or more pooled connections to this ${dialect} database were lost. Did the database server go offline?  ${(err?err.message:'')}`;
          if (flaverr.parseError(err)) {
            err = flaverr({ raw: flaverr.parseError(err), message }, err);// «««« Note that we don't do parseError(err)||err because we already ensured that the error is parsable above
          } else {
            err = new Error(message);
          }//ﬁ
          onUnexpectedFailure(err);
        }//ﬁ
      });//œ

      // Finally, build and return the manager.
      return {
        manager: { pool, connectionString, dialect, dbLibrary },
        meta
      };
    } else if (dialect === 'pg') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else if (dialect === 'mssql') {
      // This adapter now uses the "tedious" package to talk to SQL Server.
      // > For old implementation, see:
      // > https://github.com/mikermcneil/sails-sql/blob/53e0e5c58492ba44c528d6882f135f886ac2c44b/lib/private/driver.js#L134-L163

      // Note: We pass through underlying `meta` stuff as-is, but exclude our
      // standard properties... with the exception of `port` and `database`, b/c
      // that's how you actually pass those things in for `tedious`.
      // (Any other "options" are miscellaneous, such as `encrypt:true` for
      // Windows Azure.)
      // > More info:
      // > http://tediousjs.github.io/tedious/api-connection.html#function_newConnection
      let tdsConnectionSettings = {
        server: underlyingDbLibraryConfig.host,
        options: {
          encrypt: false,
          rowCollectionOnRequestCompletion: true,//« otherwise there will never be result data from queries
          ...(_.omit(underlyingDbLibraryConfig, [
            'host',
            'user',
            'password',
            'protocolPrefix'
          ]))
        },
        authentication: {
          type: 'default',
          options: {
            userName: underlyingDbLibraryConfig.user,
            password: underlyingDbLibraryConfig.password,
          }
        }
      };

      return {
        manager: { tdsConnectionSettings, dialect, dbLibrary, unreleasedConnections: [] },
        meta
      };
    } else if (dialect === 'oracledb') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else if (dialect === 'sqlite3') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else { throw new Error('Unsupported dialect'); }
  },

  /**
   * @see https://github.com/node-machine/driver-interface/blob/master/layers/connectable/destroy-manager.js
   * @see http://npmjs.com/package/driver-interface
   */
  destroyManager: async function({manager, meta}) {
    if (!meta) { meta = {}; }

    if (manager.dialect === 'mysql') {
      // TODO: double-check whether we ought to call manager.pool.removeAllListeners('error') here
      return await new Promise((resolve, reject)=>{
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
    } else if (manager.dialect === 'pg') {
      throw new Error('Support for that dialect is incomplete...  (FUTURE)');
    } else if (manager.dialect === 'mssql') {
      // This adapter now uses the "tedious" package to talk to SQL Server.
      // > For old implementation, see:
      // > https://github.com/mikermcneil/sails-sql/blob/53e0e5c58492ba44c528d6882f135f886ac2c44b/lib/private/driver.js#L194-L224
      try {
        let releaseErrors = [];
        for (let unreleased of _.clone(manager.unreleasedConnections)) {
          // ^Note that we use a shallow clone here to prevent accidentally getting
          // stuck in the loop, since releasing the connection will mutate our array.
          try {
            await DRIVER.releaseConnection({ connection: unreleased, meta });
          } catch (err) {
            releaseErrors.push(flaverr.parseError(err)||err);
          }
        }//∞
        if (releaseErrors.length > 0) {
          throw flaverr({// we just throw here because he have an outer `catch` block
            message: `When attempting to destroy manager, failed to release ${releaseErrors.length} connections.`,
            releaseErrors
          }, new Error());
        }//•
        return { meta };
      } catch (err) {
        throw {failed: { error:err, meta }};
      }
    } else if (manager.dialect === 'oracledb') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else if (manager.dialect === 'sqlite3') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else { throw new Error('Unsupported dialect'); }
  },

  /**
   * @see https://github.com/node-machine/driver-interface/blob/master/layers/connectable/get-connection.js
   * @see http://npmjs.com/package/driver-interface
   *
   * > Note: For this driver, a connection must always expose its `dialect`.
   */
  getConnection: async function({manager, meta}) {
    if (!meta) { meta = {}; }

    if (manager.dialect === 'mysql') {
      return await new Promise((resolve, reject)=>{
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
    } else if (manager.dialect === 'pg') {
      throw new Error('Support for that dialect is incomplete...  (FUTURE)');
    } else if (manager.dialect === 'mssql') {
      return await new Promise((resolve, reject)=>{
        // This adapter now uses the "tedious" package to talk to SQL Server.
        // > For old implementation, see:
        // > https://github.com/mikermcneil/sails-sql/blob/53e0e5c58492ba44c528d6882f135f886ac2c44b/lib/private/driver.js#L258-L277

        let underlyingConnection = new manager.dbLibrary.Connection(manager.tdsConnectionSettings);
        // ^^FUTURE: replace one-off connection with impl. that leverages connection pooling (see https://github.com/tediousjs/tedious-connection-pool)

        let onTdsDebug = (unusedText)=>{
          // console.log('TDS CONNECTION DEBUG:', unusedText);// «« FUTURE: maybe bring in "debug" package here instead
        };//ƒ
        let onTdsError = (err)=>{
          reject(flaverr({ message: 'An error occurred involving a Microsoft SQL Server connection: '+err.message }, err));
        };//ƒ
        let onceTdsConnect = (err)=>{
          if (err) {
            // Sometimes you get weird errors that _.isError() doesn't recognize.
            // Since flaverr.parseError() doesn't know how to handle these yet,
            // we just do it ourselves right here:
            if (!_.isError(err) && _.isString(err.message) && _.isString(err.stack)) {
              err = flaverr({
                _originalStack: err.stack,
                ..._.omit(err, ['stack']),
              });
            }//ﬁ
            // ^^TODO: pull this generic workaround into flaverr.parseError()
            let error = flaverr({ message: 'Failed to obtain a connection to Microsoft SQL Server.  '+err.message }, err);
            let report = { error, meta };
            reject({failed: report});
          } else {
            let connection = {//« Waterline's concept of a "connection" that we'll send back
              underlyingConnection,
              dialect: manager.dialect,
              manager: manager,
              removeListenersOnUnderlyingConnection: ()=>{
                underlyingConnection.removeListener('connect', onceTdsConnect);
                underlyingConnection.removeListener('debug', onTdsDebug);
                underlyingConnection.removeListener('error', onTdsError);
              }
            };
            manager.unreleasedConnections.push(connection);
            resolve({ connection, meta });
          }
        };//ƒ
        underlyingConnection.once('connect', onceTdsConnect);//œ
        underlyingConnection.on('debug', onTdsDebug);//œ
        underlyingConnection.on('error', onTdsError);//œ
      });//•_∏_
    } else if (manager.dialect === 'oracledb') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else if (manager.dialect === 'sqlite3') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else { throw new Error(`Unsupported dialect "${manager.dialect}"`); }
  },

  /**
   * @see https://github.com/node-machine/driver-interface/blob/master/layers/connectable/release-connection.js
   * @see http://npmjs.com/package/driver-interface
   *
   * > Note: below we first check some basic assertions about the provided connection.
   * > (this doesn't guarantee it's still active or anything, but it does let
   * > us know that it at least _HAS_ the properly formatted methods and properties
   * > necessary for internal use in this Waterline driver)
   */
  releaseConnection: async function({connection, meta}) {
    if (!meta) { meta = {}; }

    // Validate connection
    if (!getIsValidConnection(connection)) {
      let report = { meta };
      throw {badConnection: report};
    }//•

    // Since it's legit, go ahead and release the connection:
    if (connection.dialect === 'mysql') {
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

      return { meta };//«IWMIH, we got rid of the connection, one way or another
    } else if (connection.dialect === 'pg') {
      throw new Error('Support for that dialect is incomplete...  (FUTURE)');
    } else if (connection.dialect === 'mssql') {
      // This adapter now uses the "tedious" package to talk to SQL Server.
      // > For old implementation, see:
      // > https://github.com/mikermcneil/sails-sql/blob/53e0e5c58492ba44c528d6882f135f886ac2c44b/lib/private/driver.js#L321-L328
      connection.removeListenersOnUnderlyingConnection();
      let manager = connection.manager;
      if (manager.unreleasedConnections.indexOf(connection) !== -1) {
        manager.unreleasedConnections.splice(connection, 1);
      }//ﬁ
      connection.underlyingConnection.close();//« http://tediousjs.github.io/tedious/api-connection.html#function_close
      // FUTURE: Maybe wait for "end" event before resolving? (Not important enough to bother w/ right now.)
      return { meta };
    } else if (connection.dialect === 'oracledb') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else if (connection.dialect === 'sqlite3') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else { throw new Error('Unsupported dialect'); }
  },


  //   ██████╗ ██╗   ██╗███████╗██████╗ ██╗   ██╗ █████╗ ██████╗ ██╗     ███████╗
  //  ██╔═══██╗██║   ██║██╔════╝██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗██║     ██╔════╝
  //  ██║   ██║██║   ██║█████╗  ██████╔╝ ╚████╔╝ ███████║██████╔╝██║     █████╗
  //  ██║▄▄ ██║██║   ██║██╔══╝  ██╔══██╗  ╚██╔╝  ██╔══██║██╔══██╗██║     ██╔══╝
  //  ╚██████╔╝╚██████╔╝███████╗██║  ██║   ██║   ██║  ██║██████╔╝███████╗███████╗
  //   ╚══▀▀═╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝
  //
  /**
   * @see https://github.com/node-machine/driver-interface/blob/master/layers/queryable/send-native-query.js
   * @see http://npmjs.com/package/driver-interface
   *
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * FUTURE: MAYBE update Sails documentation and node-machine driver interface to show using "?" instead of "$1", etc
   * • https://github.com/node-machine/driver-interface/blob/master/layers/queryable/send-native-query.js
   * • https://sailsjs.com/documentation/reference/waterline-orm/datastores/send-native-query
   *
   * --OR--
   * TODO: at least convert the stuff from knex into $1, $2, etc. so our documented usage will work
   * Currently below we're just using ? everywhere.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  sendNativeQuery: async function({connection, nativeQuery, valuesToEscape, meta}) {
    if (!meta) { meta = {}; }
    if (!getIsValidConnection(connection)) {
      throw {badConnection: {meta}};
    }//•

    try {
      if (connection.dialect === 'mysql') {
        return await new Promise((resolve, reject)=>{
          connection.query({
            sql: nativeQuery,
            values: valuesToEscape
          }, (err, cbArg2, cbArg3)=>{
            if (err) {
              let report = { error: flaverr.parseError(err)||err, meta };
              reject({queryFailed: report});
              return;
            }//•
            // Note: This implementation is based on the original mp-mysql package.
            // For notes and reasoning from that earlier rendition, check out:
            // https://github.com/sailshq/machinepack-mysql/blob/98f90ce07928163cde956fdf43c6d27534175233/lib/send-native-query.js#L150-L325
            let isUnexpectedOutput = (
              (cbArg2 && !_.isObject(cbArg2)) ||
              (cbArg3 && !_.isArray(cbArg3))
            );
            if (isUnexpectedOutput) {
              reject(new Error(
                `Query was successful, but output from "mysql" package is in an unrecognized format.  `+
                `Output (2nd callback arg):\n`+
                `${util.inspect(cbArg2, {depth:null})}\n`+
                `\n`+
                `Output (3rd callback arg):\n`+
                `${util.inspect(cbArg3, {depth:null})}`
              ));
              return;
            }//•

            let result = (
              _.isArray(cbArg2)?
              {
                rows: cbArg2
              }
              :
              cbArg2
            );

            if (cbArg3) {
              result = result || {};
              result.fields = cbArg3;
            }//>-

            let report = { result, meta };
            resolve(report);
          });//_∏_
        });//•_∏_  </ new Promise() >
      } else if (connection.dialect === 'pg') {
        throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      } else if (connection.dialect === 'mssql') {
        // This adapter now uses the "tedious" package to talk to SQL Server.
        // > For old implementation, see:
        // > https://github.com/mikermcneil/sails-sql/blob/53e0e5c58492ba44c528d6882f135f886ac2c44b/lib/private/driver.js#L413-L476
        return await new Promise((resolve, reject)=>{

          let potentiallyAdjustedNativeQuery = nativeQuery;
          if (valuesToEscape) {
            // Replace "?" syntax with special SQL Server syntax.
            // (See http://tediousjs.github.io/tedious/parameters.html)
            // (See also "TODO" above about "$1","$2","$3",etc. vs. "?")
            let i = 0;
            potentiallyAdjustedNativeQuery = nativeQuery.replace(/\?/g, ()=>{
              i++;
              return `@p${i-1}`;
            });
            // console.log('connection.manager.dbLibrary?', connection.manager.dbLibrary);
            // console.log('original nativeQuery', nativeQuery);
            // console.log('potentiallyAdjustedNativeQuery',potentiallyAdjustedNativeQuery);
          }//ﬁ

          console.log('potentiallyAdjustedNativeQuery:  ', potentiallyAdjustedNativeQuery);

          // http://tediousjs.github.io/tedious/api-request.html#function_newRequest
          let mssqlRequest = new connection.manager.dbLibrary.Request(potentiallyAdjustedNativeQuery, (err, rowCount, msMatrix)=>{
            if (err) {
              reject({queryFailed: {error: flaverr.parseError(err)||err, meta}});
              return;
            }//•
            // console.log('query:', potentiallyAdjustedNativeQuery, '\nNATIVE-ISH RESULT:',rowCount, require('util').inspect(msMatrix, {depth:null}));

            let result;
            if (!_.isArray(msMatrix)) {
              result = msMatrix;
            } else {
              result = { rows: [] };
              for (let msRow of msMatrix) {
                let phRecord = {};
                for (let msCell of msRow) {
                  phRecord[msCell.metadata.colName] = msCell.value;
                }//∞
                result.rows.push(phRecord);
              }//∞
            }//ﬁ

            resolve({ result, meta });
          });//_∏_

          for (let idx in valuesToEscape) {
            let MIN_SAFE_BIGINT = -9007199254740991;
            let MAX_SAFE_BIGINT = 9007199254740991;
            if (_.isNaN(valuesToEscape[idx]) || (_.isNumber(valuesToEscape[idx]) && valuesToEscape[idx] % 1 === 0 && (valuesToEscape[idx] < MIN_SAFE_BIGINT || valuesToEscape[idx] > MAX_SAFE_BIGINT))) {
              throw new Error(`Specified integer (${valuesToEscape[idx]}) is unsafe.  In other words, it's either too big, too small, or too weird.  (Don't use this number-- or, to work around this, you can pass in this big integer as a string instead of a number-- i.e. wrap it in quotes.)`);
            }//•

            // This implementation re: types is based on https://github.com/tgriesser/knex/blob/30bab697ba77b7a20156775c43fc9538b6698368/src/dialects/mssql/index.js#L306-L321
            // > For more info on addParameter's other options, see http://tediousjs.github.io/tedious/api-request.html#function_addParameter
            // > Or for reference of all MSSQL data types, see http://tediousjs.github.io/tedious/api-datatypes.html
            let mssqlParamType;
            let mssqlParamOpts = {};
            if (!_.isNumber(valuesToEscape[idx])) {
              mssqlParamType = connection.manager.dbLibrary.TYPES.NVarChar;
              mssqlParamOpts.length = Infinity;
            } else if (valuesToEscape[idx] % 1 !== 0) {
              mssqlParamType = connection.manager.dbLibrary.TYPES.Float;
              // This is how it would work if we instead used the "Decimal" type:
              // ```
              // mssqlParamType = connection.manager.dbLibrary.TYPES.Decimal;
              // mssqlParamOpts.scale = 5;//« supposedly this can be set to 10, but if you use any scale ≥6, it doesn't work (e.g. try doing (Date.now()+Math.random()) -- there will be an error)
              // // mssqlParamOpts.precision = 19;// « Note we leave this out altogether.  If we specify it, it seems to cause an error.  FUTURE: Explore whether this should actually be specified.  Specifying it seems to cause an error (`TypeError: "value" argument is out of bounds`), which might be related to related to https://stackoverflow.com/questions/46602155/node-js-post-base64-value-is-out-of-bounds?rq=1#comment80157913_46602155  .  Also note that this could potentially be 38 instead (but note that "tedious" docs say this only works up to 19 anyway, and that 18 is the default.  At least as of Mar 19, 2019)
              // ```
            } else if (valuesToEscape[idx] >= -2147483648 && valuesToEscape[idx] <= 2147483647){//« min&max legal values for INT4s in MSSQL
              mssqlParamType = connection.manager.dbLibrary.TYPES.Int;
            } else {
              mssqlParamType = connection.manager.dbLibrary.TYPES.BigInt;
            }

            console.log('-');
            console.log('• mssqlParamType', mssqlParamType);
            console.log('• valuesToEscape[idx]', valuesToEscape[idx]);

            mssqlRequest.addParameter(
              `p${idx}`,
              mssqlParamType,
              valuesToEscape[idx],
              mssqlParamOpts
            );
          }//∞

          connection.underlyingConnection.execSql(mssqlRequest);// http://tediousjs.github.io/tedious/api-connection.html#function_execSql
        });//•_∏_  </ new Promise() >
      } else if (connection.dialect === 'oracledb') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
      else if (connection.dialect === 'sqlite3') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
      else { throw new Error('Unsupported dialect'); }
    } catch (errOrSignal) {
      // If exiting queryFailed, give the error a `.dialect` before throwing.
      // > This is safe to do because we always use a special exit signal.
      if (errOrSignal.queryFailed) {
        errOrSignal.queryFailed.error.dialect = connection.dialect;
      }//ﬁ
      throw errOrSignal;
    }
  },

  /**
   * @see https://github.com/node-machine/driver-interface/blob/master/layers/queryable/parse-native-query-error.js
   * @see http://npmjs.com/package/driver-interface
   *
   * > For more information on error footprints, check out historical notes:
   * > https://github.com/node-machine/waterline-driver-interface#footprints
   */
  parseNativeQueryError: function({nativeQueryError, meta}) {
    if (!meta) { meta = {}; }

    if (!_.isObject(nativeQueryError)) {
      let footprint = { identity: 'catchall '};
      return { footprint, meta };
    }//•

    if (nativeQueryError.dialect === 'mysql') {
      let footprint;
      if (nativeQueryError.code === 'ER_DUP_ENTRY') {
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        // `code`  : 'ER_DUP_ENTRY'
        // `errno`  : 1062
        //   -- Recognized as the `notUnique` footprint from the
        //      Waterline driver spec.  If additional information
        //      is needed in userland beyond what is guaranteed in
        //      the spec, then you should take advantage of `meta`.
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        footprint = { identity: 'notUnique', keys: [] };
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        // FUTURE: Bring back key-level details. (omitted because we're waiting
        // on making it so the new knex DDL stuff customizes the key names, and because that automigration convention will need to be documented)
        // ```
        // Now build our footprint's `keys` property by manually parsing the MySQL error message and extracting the relevant bits.
        // (See also: https://github.com/balderdashy/sails-mysql/blob/2c414f1191c3595df2cea8e40259811eb3ca05f9/lib/adapter.js#L1223)
        // if (_.isString(nativeQueryError.message)) {
        //   let matches = nativeQueryError.message.match(/Duplicate entry '.*' for key '(.*?)'$/);
        //   if (matches && matches.length > 0) {
        //     footprint.keys.push(matches[1]);
        //   }
        // }
        // ```
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      } else if (nativeQueryError.code === 'ER_NO_SUCH_TABLE' || nativeQueryError.code === 'ER_BAD_TABLE_ERROR') {
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        // `code`  : 'ER_NO_SUCH_TABLE'   -OR-  'ER_BAD_TABLE_ERROR'
        // `errno`  : 1146                -OR-  1051
        //   -- This footprint not in the specification yet; this driver
        //      is ahead of the spec.
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        footprint = { identity: 'noSuchPhysicalModel' };
      } else if (nativeQueryError.code === 'ER_PARSE_ERROR') {
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        // `code`  : 'ER_PARSE_ERROR'
        // `errno`  : 1064
        //   -- This footprint not in the specification yet; this driver
        //      is ahead of the spec.
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        footprint = { identity: 'couldNotParseNativeQuery' };
      } else {
        footprint = { identity: 'catchall' };
      }//ﬁ

      return { footprint, meta };

    } else if (nativeQueryError.dialect === 'pg') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else if (nativeQueryError.dialect === 'mssql') {
      let footprint;
      if (nativeQueryError.code === 'EREQUEST' && (nativeQueryError.number === 208 || nativeQueryError.number === 3701)) {// https://docs.microsoft.com/en-us/previous-versions/sql/sql-server-2008-r2/cc645601%28v%3dsql.105%29
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        // message: 'Invalid object name \'notarealtable\'.',
        // code: 'EREQUEST',
        // number: 208,
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        // TODO: test that this works
        footprint = { identity: 'noSuchPhysicalModel' };
      } else if (nativeQueryError.code === 'EREQUEST' && (nativeQueryError.number === 2601)) {
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        // message: 'Internal error occurred while running `createRecord`.  Got non-Error: { RequestError: Cannot insert duplicate key row in object 'dbo.the_foo' with unique index 'the_foo_the_beep_unique'. The duplicate key value is (1.55239e+012).'
        // code: 'EREQUEST',
        // number: 2601,
        // --o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o--o-<>
        footprint = { identity: 'notUnique', keys: [] };// FUTURE: Support key-level details, if possible w/ SQL Server
      } else {
        footprint = { identity: 'catchall' };
      }
      return { footprint, meta };
    } else if (nativeQueryError.dialect === 'oracledb') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else if (nativeQueryError.dialect === 'sqlite3') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else { throw new Error('Unsupported dialect'); }
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
    if (!meta) { meta = {}; }
    if (!getIsValidConnection(connection)) {
      let report = {meta};
      throw {badConnection: report};
    }//•

    switch (connection.dialect) {
      case 'mysql':
      case 'pg':
      case 'mssql':
      case 'sqlite3':
        await runNativeQuery('BEGIN', undefined, connection, meta, DRIVER);
        break;
      case 'oracledb':
        // For oracle, use START TRANACTION instead, because "BEGIN" has the
        // side-effect of causing auto-commit mode to become a thing
        await runNativeQuery('START TRANSACTION', undefined, connection, meta, DRIVER);
        break;
      default: throw new Error('Unsupported dialect');
    }

    return { meta };
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  commitTransaction: async function({connection, meta}) {
    if (!meta) { meta = {}; }
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
        await runNativeQuery('COMMIT', undefined, connection, meta, DRIVER);
        break;
      default: throw new Error('Unsupported dialect');
    }

    return { meta };
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  rollbackTransaction: async function({connection, meta}) {
    if (!meta) { meta = {}; }
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
        await runNativeQuery('ROLLBACK', undefined, connection, meta, DRIVER);
        break;
      default: throw new Error('Unsupported dialect');
    }

    return { meta };
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
   *
   * > This validates models vs. any adapter-specific ontological restrictions.
   */
  verifyModelDef: function({modelDef}) {
    if (!this.dialect) {
      throw new Error(
        'To use verifyModelDef() with this package, it must be invoked with its SQL dialect declared under the `dialect` meta key.  '+
        'For example: `await verifyModelDef(WLModel).meta({dialect: \'mysql\'});`'
      );
    }

    // Ensure that the model's primary key is either required or auto-incrementing.
    // https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/register-data-store.js#L110-L113
    var primaryKeyAttrDef = modelDef.attributes[modelDef.primaryKey];
    if (primaryKeyAttrDef.required !== true) {
      let isAutoIncrementing = (primaryKeyAttrDef.autoMigrations && primaryKeyAttrDef.autoMigrations.autoIncrement === true);
      if (!isAutoIncrementing) {
        throw {invalid: new Error(`In model "${modelDef.identity}", the primary key attribute is not valid for this adapter.  (It should be either required, or auto-incrementing.)`)};
      }//•
    }

    switch (this.dialect) {
      case 'mysql': break;
      case 'pg':
        for (let attrName in modelDef.attributes) {
          let attrDef = modelDef.attributes[attrName];
          // Ensure that no attributes declare themselves both columnType: 'BIGINT' & type: 'number' (except for auto-timestamps)
          // https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/register-data-store.js#L110-L125
          let isBigintColumn = !!(attrDef.autoMigrations && attrDef.autoMigrations.columnType.match(/^BIGINT$/i));
          if (isBigintColumn && attrDef.type === 'number' && !attrDef.autoCreatedAt && !attrDef.autoUpdatedAt) {
            throw {invalid: new Error(`In attribute "${attrName}" of model "${modelDef.identity}", the columnType: \'BIGINT\' cannot be used alongside type: 'number'.  Since "BIGINT" values may be larger than the maximum JavaScript integer size, PostgreSQL will return them as strings.  Therefore, attributes using this column type should be declared as type: 'string'.`)};
          }
          // FUTURE: probably do the same thing for other potentially problematic column types like BIGSERIAL
        }//∞
        break;
      case 'mssql': break;
      case 'oracledb': break;
      case 'sqlite3': break;
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  createRecord: async function({query, connection, dryOrm}) {
    var queryCopy = _.omit(query, ['newRecord']);
    _.extend(queryCopy, {
      method: 'createEach',
      newRecords: [ query.newRecord ]
    });
    // console.log('createRecord() query:', query);
    var phRecords = await DRIVER.createEachRecord({ query: queryCopy, connection, dryOrm });
    return phRecords ? phRecords[0] : undefined;
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   * @see https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/create-each.js
   * @see https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/query/create-each.js
   * @see https://knexjs.org/#Builder-insert
   */
  createEachRecord: async function({query, connection, dryOrm}) {
    var tableName = query.using;
    var DryWLModel = _.find(dryOrm.models, { tableName });
    var dialect = connection.dialect;
    var isFetchEnabled = (query.meta && query.meta.fetch) ? true : false;
    var isCapableOfOptimizedReturnTactic = (_.contains(['pg','mssql','oracledb'], dialect));
    var k = initializeKnex(dialect);

    // Reify (preprocess) new physical values to set.
    for (let phValuesToSet of query.newRecords) {
      reifyPhysicalValuesToSet(phValuesToSet, dialect, DryWLModel);
    }//∞

    // Handle PostgreSQL schema stuff
    // > https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/create-each.js#L106-L117
    if (dialect === 'pg') {
      // FUTURE: postgresql schema stuff
    }

    // Build native SQL queries(s)
    var nativeQueries = [];
    {
      // • FUTURE: implement dialect-agnostic batching (for parity with knex core -- see https://knexjs.org/#Utility-BatchInsert and https://github.com/tgriesser/knex/blob/09eb12638c846822f06b4f6ab599ebcda6821d3f/src/util/batchInsert.js)
      // • FUTURE: customizable chunk size meta key
      // • FUTURE: even if this can't be done in a single query, at least could do all of them simultaneously
      for (let phValuesToSet of query.newRecords) {
        let queryForSingleInsert;
        if (!isFetchEnabled) {
          queryForSingleInsert = k(tableName).insert(phValuesToSet).toSQL();
        } else if (isCapableOfOptimizedReturnTactic) {
          queryForSingleInsert = k(tableName).returning('*').insert(phValuesToSet).toSQL();
          // (^re: optimized "returning()" thing, see https://knexjs.org/#Builder-returning)
        } else {
          queryForSingleInsert = k(tableName).insert(phValuesToSet).toSQL();
          // (^for more historical background on this polyfill, see https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/query/create-each.js#L169-L184 and https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/query/create.js#L82-L94)
        }
        nativeQueries.push(queryForSingleInsert);
      }//∞
    }//∫

    // Run query, negotiating & rethrowing native query error, if applicable.
    let phRecords = isFetchEnabled ? [] : undefined;
    let insertIds = [];
    for (let qInfo of nativeQueries) {
      let nativishResult;
      try {
        nativishResult = await runNativeQuery(qInfo.sql, qInfo.bindings, connection, query.meta, DRIVER);
      } catch (err) {
        if (err.footprint && err.footprint.identity === 'notUnique') {
          throw {notUnique: err};
        } else {
          throw err;
        }//•
      }
      if (isFetchEnabled) {
        if (isCapableOfOptimizedReturnTactic) {
          phRecords = phRecords.concat(nativishResult.rows);
        } else {
          insertIds.push(nativishResult.insertId);
        }
      }//ﬁ
    }//∞

    // Get newly inserted records, sorted by primary key.
    if (!isCapableOfOptimizedReturnTactic) {
      let pkColumnName = DryWLModel.attributes[DryWLModel.primaryKey].columnName;
      let fetchQInfo = k(tableName).whereIn(pkColumnName, insertIds).select('*').orderBy(pkColumnName, 'asc').toSQL();
      try {
        let fetchQResult = await runNativeQuery(fetchQInfo.sql, fetchQInfo.bindings, connection, query.meta, DRIVER);
        if (fetchQResult.rows.length !== insertIds.length) { throw new Error(`The database returned the wrong number of rows.  Expected ${insertIds.length} row(s), but instead got ${fetchQResult.rows.length}: ${util.inspect(fetchQResult.rows, {depth:null})}`); }
        phRecords = fetchQResult.rows;
      } catch (err) {
        throw flaverr({ message: 'Could not look up newly created record(s).  '+err.message }, err);
      }
    }//ﬁ

    // Postprocess physical record(s) (mutate in-place) to wash away adapter-specific eccentricities.
    if (isFetchEnabled) {
      // • TODO: make sure fetch is properly preserving order, otherwise fall back (https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/query/create-each.js#L169-L184)
      processNativeRecords(phRecords, dialect, DryWLModel.identity, dryOrm);
      return phRecords;
    }//ﬁ
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  updateRecords: async function({query, connection, dryOrm}) {
    var tableName = query.using;
    var DryWLModel = _.find(dryOrm.models, { tableName });
    var dialect = connection.dialect;
    var isFetchEnabled = (query.meta && query.meta.fetch) ? true : false;
    var isCapableOfOptimizedReturnTactic = false;//«FUTURE: implement optimized return tactic (where supported)
    var k = initializeKnex(dialect);

    // Reify (preprocess) new physical values to set.
    reifyPhysicalValuesToSet(query.valuesToSet, dialect, DryWLModel);

    var nativeRowsFetched;
    if (isFetchEnabled && !isCapableOfOptimizedReturnTactic) {
      // For historical context, see https://github.com/balderdashy/sails-mysql/blob/8cf4dcc5f7c4b979c778d597ad6cca29a8efe2a0/helpers/private/query/update.js#L42-L51
      let kQuery = compileWhereClauseIntoKnexChain(query.criteria.where, k(tableName).select(), DryWLModel, dryOrm)
      .toSQL();
      nativeRowsFetched = (await runNativeQuery(kQuery.sql, kQuery.bindings, connection, query.meta, DRIVER)).rows;
    }//ﬁ

    var kQuery = compileWhereClauseIntoKnexChain(query.criteria.where, k(tableName), DryWLModel, dryOrm)
    .update(query.valuesToSet)// « FUTURE: probably need to use 2nd arg here to implement optimized return tactic, so making that happen would take some refactoring.  BUT might be able to just chain on ".returning()" -- see knex docs when the time comes
    .toSQL();

    var nativishResult;
    try {
      nativishResult = await runNativeQuery(kQuery.sql, kQuery.bindings, connection, query.meta, DRIVER);
    } catch (err) {
      throw (!err.footprint) ? err
      : err.footprint.identity === 'notUnique' ? {notUnique: err}
      : err;
    }
    if (isCapableOfOptimizedReturnTactic) {
      // PostgreSQL example: https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/private/query/modify-record.js#L64-L65
      throw new Error('FUTURE: Not yet implemented optimized "returning" tactic - see native result: '+nativishResult);
    }

    if (!isFetchEnabled) {
      return null;
    } else {
      processNativeRecords(nativeRowsFetched, dialect, DryWLModel.identity, dryOrm);
      return nativeRowsFetched;
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  destroyRecords: async function({query, connection, dryOrm}) {
    var tableName = query.using;
    var DryWLModel = _.find(dryOrm.models, { tableName });
    var dialect = connection.dialect;
    var isFetchEnabled = (query.meta && query.meta.fetch) ? true : false;
    var isCapableOfOptimizedReturnTactic = false;//«FUTURE: implement optimized return tactic (where supported)
    var k = initializeKnex(dialect);

    var nativeRowsFetched;
    if (isFetchEnabled && !isCapableOfOptimizedReturnTactic) {
      // For historical context, see https://github.com/balderdashy/sails-mysql/blob/8cf4dcc5f7c4b979c778d597ad6cca29a8efe2a0/helpers/private/query/destroy.js#L42-L47
      let kQuery = compileWhereClauseIntoKnexChain(query.criteria.where, k(tableName).select(), DryWLModel, dryOrm)
      .toSQL();
      nativeRowsFetched = (await runNativeQuery(kQuery.sql, kQuery.bindings, connection, query.meta, DRIVER)).rows;
    }//ﬁ

    var kQuery = compileWhereClauseIntoKnexChain(query.criteria.where, k(tableName), DryWLModel, dryOrm)
    .del()
    .toSQL();

    var nativishResult = await runNativeQuery(kQuery.sql, kQuery.bindings, connection, query.meta, DRIVER);
    if (isCapableOfOptimizedReturnTactic) {
      // PostgreSQL example: https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/destroy.js#L136-L138
      throw new Error('FUTURE: Not yet implemented optimized "returning" tactic - see native result: '+nativishResult);
    }//ﬁ

    if (!isFetchEnabled) {
      return null;
    } else {
      processNativeRecords(nativeRowsFetched, dialect, DryWLModel.identity, dryOrm);
      return nativeRowsFetched;
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  findRecords: async function({query, connection, dryOrm}) {
    var tableName = query.using;
    var DryWLModel = _.find(dryOrm.models, { tableName });
    var dialect = connection.dialect;
    var k = initializeKnex(dialect);


    // FUTURE: also support row-locking
    var kChain = k(tableName);
    if (query.criteria.select === undefined) {
      kChain = kChain.select();
    } else {
      kChain = kChain.select(query.criteria.select);
    }
    kChain = compileWhereClauseIntoKnexChain(query.criteria.where, kChain, DryWLModel, dryOrm);
    kChain = kChain.limit(query.criteria.limit);
    kChain = kChain.offset(query.criteria.skip);
    if (dialect === 'mssql' && query.criteria.sort.length === 0) {
      // In MSSQL, paginating without an explicit "sort" clause doesn't work.
      // So if there is no comparator directives, we'll default to {[pkColumnName]:'ASC'}
      let pkColumnName = DryWLModel.attributes[DryWLModel.primaryKey].columnName;
      kChain = kChain.orderBy(pkColumnName, 'asc');
    } else {
      for (let comparatorDirective of query.criteria.sort) {
        let sortByColumn = Object.keys(comparatorDirective)[0];
        let sortDirection = comparatorDirective[sortByColumn];
        kChain = kChain.orderBy(sortByColumn, sortDirection.toLowerCase());
      }//∞
    }
    var kQuery = kChain.toSQL();
    console.log('kQuery:', kQuery);
    var nativishResult = await runNativeQuery(kQuery.sql, kQuery.bindings, connection, query.meta, DRIVER);

    var rows;
    switch (dialect) {
      case 'mysql':
        rows = nativishResult.rows;
        break;
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql':
        rows = nativishResult.rows;
        break;
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
    processNativeRecords(rows, dialect, DryWLModel.identity, dryOrm);
    return rows;
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   * @see https://knexjs.org/#Builder-count
   */
  countRecords: async function({query, connection, dryOrm}) {
    var tableName = query.using;
    var DryWLModel = _.find(dryOrm.models, { tableName });
    var dialect = connection.dialect;
    var k = initializeKnex(dialect);

    // FUTURE: support row-locking

    var kChain = k(tableName).count({ VAL: '*' });
    kChain = compileWhereClauseIntoKnexChain(query.criteria.where, kChain, DryWLModel, dryOrm);
    var kQuery = kChain.toSQL();
    var nativishResult = await runNativeQuery(kQuery.sql, kQuery.bindings, connection, query.meta, DRIVER);
    var total = nativishResult.rows[0].VAL;
    if (dialect === 'pg') {
      total = +(total);//« In Postgres, the native result from COUNT comes back as a string and not a number.
    }//ﬁ
    if (!_.isNumber(total) || _.isNaN(total) || total < 0 || Math.floor(total) !== Math.ceil(total)) {
      throw new Error('Unexpected result from database: Total from a COUNT query should be a non-negative safe integer.  But instead, got: '+total);
    }
    return total;
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   * @see https://knexjs.org/#Builder-sum
   */
  sumRecords: async function({query, connection, dryOrm}) {
    var tableName = query.using;
    var DryWLModel = _.find(dryOrm.models, { tableName });
    var dialect = connection.dialect;
    var k = initializeKnex(dialect);
    var targetField = query.numericAttrName;//« see 59b3d90042697b767b995da654192137ab124af7 in Waterline core repo for more about this

    // FUTURE: support row-locking

    var kChain = k(tableName).sum({ VAL: targetField });
    kChain = compileWhereClauseIntoKnexChain(query.criteria.where, kChain, DryWLModel, dryOrm);
    var kQuery = kChain.toSQL();
    var nativishResult = await runNativeQuery(kQuery.sql, kQuery.bindings, connection, query.meta, DRIVER);
    var sum = nativishResult.rows[0].VAL;
    return sum === null ? 0 : sum;
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   * @see https://knexjs.org/#Builder-avg
   */
  avgRecords: async function({query, connection, dryOrm}) {
    var tableName = query.using;
    var DryWLModel = _.find(dryOrm.models, { tableName });
    var dialect = connection.dialect;
    var k = initializeKnex(dialect);
    var targetField = query.numericAttrName;//« see 59b3d90042697b767b995da654192137ab124af7 in Waterline core repo for more about this

    // FUTURE: support row-locking

    var kChain = k(tableName).avg({ VAL: targetField });
    kChain = compileWhereClauseIntoKnexChain(query.criteria.where, kChain, DryWLModel, dryOrm);
    var kQuery = kChain.toSQL();
    var nativishResult = await runNativeQuery(kQuery.sql, kQuery.bindings, connection, query.meta, DRIVER);
    var arithmeticMean = nativishResult.rows[0].VAL;
    return arithmeticMean === null ? 0 : arithmeticMean;
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
  definePhysicalModel: async function({connection, tableName, columns, meta}) {
    var k = initializeKnex(connection.dialect);
    let nativeQueries = k.schema.createTable(tableName, (kTable)=>{
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      // Implementation based on:
      // • https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/schema/build-schema.js
      // • https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/schema/build-indexes.js
      // • https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/private/schema/build-schema.js
      // • https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/private/schema/build-indexes.js
      // • http://knexjs.org/#Schema-createTable
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      for (let column of columns) {
        if (column.autoIncrement) {
          // FUTURE: add double-checking when postgresql based on https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/private/schema/build-schema.js#L43-L99
          // Because assigning a BIGSERIAL columnType is polluting fks right now-- see https://gitter.im/balderdashy/sails?at=5bf30947b86c70503f57b74c
          kTable.increments(column.columnName);
          // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          // ^^ FUTURE: (Maybe.)  Add support for custom column types for autoincrement
          // Note this is more about supporting pg's BIGSERIAL and less about non-numeric
          // autoincrement strategies (e.g. https://github.com/balderdashy/sails-postgresql/pull/278)
          //
          // See also:
          // - https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/private/schema/build-schema.js#L43-L100
          // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        } else {
          let computedColumnType;
          switch (column.columnType.toLowerCase()) {
            // Reserved types (used by auto-migrations):
            case '_number':          computedColumnType = connection.dialect === 'mssql' ? 'FLOAT' : 'REAL'; break;
            case '_string':          computedColumnType = column.unique ? (connection.dialect === 'mysql' ? 'VARCHAR(255)' : 'VARCHAR') : (connection.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'); break;
            // ^^FUTURE: Use other available information like maxLength to make a better guess for the physical column type to use.
            case '_boolean':         computedColumnType = 'BOOLEAN'; break;
            case '_json':            computedColumnType = connection.dialect === 'mysql' ? 'LONGTEXT' : 'JSON'; break;
            case '_ref':             computedColumnType = connection.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'; break;
            // More reserved types for pks and timestamps (also used auto-migrations):
            case '_numberkey':       computedColumnType = 'INTEGER'; break;
            case '_stringkey':       computedColumnType = connection.dialect === 'mysql' ? 'VARCHAR(255)' : 'VARCHAR'; break;
            case '_numbertimestamp': computedColumnType = 'BIGINT'; break;
            case '_stringtimestamp': computedColumnType = connection.dialect === 'mysql' ? 'VARCHAR(255)' : 'VARCHAR'; break;
            // Misc:
            default:                 computedColumnType = column.columnType;
          }
          let kChain = kTable.specificType(column.columnName, computedColumnType);
          if (column.unique) {
            kChain = kChain.unique();
            // FUTURE: custom key name here to better facilitate `keys: []` in the `notUnique` footprint
          }
        }
      }//∞
    }).toSQL();
    for (let qInfo of nativeQueries) {
      await runNativeQuery(qInfo.sql, qInfo.bindings, connection, meta, DRIVER);
    }//∞
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  dropPhysicalModel: async function({connection, tableName, meta}) {
    var k = initializeKnex(connection.dialect);
    let nativeQueries = (k.schema.dropTable(tableName).toSQL());
    for (let qInfo of nativeQueries) {
      try {
        await runNativeQuery(qInfo.sql, qInfo.bindings, connection, meta, DRIVER);
      } catch (err) {
        if (err.footprint && err.footprint.identity === 'noSuchPhysicalModel') {
          // If this error is just indicating that the table doesn't exist,
          // then simply ignore it.  (We silently tolerate this sort of thing.)
        } else {
          throw err;
        }
      }
    }//∞
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  setPhysicalSequence: async function({connection/*, sequenceName, sequenceValue, meta*/}) {
    if (connection.dialect === 'mysql') {
      return;// No-op
    } else if (connection.dialect === 'pg') {
      // FUTURE: special postgresql implementation (see https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/set-sequence.js#L73-L117)
      // console.log(sequenceName, sequenceValue, meta);
      throw new Error('Support for that dialect is incomplete...  (FUTURE)');
    } else if (connection.dialect === 'mssql') {
      return;// No-op
    } else if (connection.dialect === 'oracledb') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else if (connection.dialect === 'sqlite3') { throw new Error('Support for that dialect is incomplete...  (FUTURE)'); }
    else { throw new Error('Unsupported dialect'); }
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
  parseNativeQueryResult: ()=>{
    throw new Error('parseNativeQueryResult() is not supported by this adapter.');
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  compileStatement: ()=>{
    throw new Error('compileStatement() is not supported by this adapter.');
  },

};


/**
 * Export driver
 * @type {Dictionary}
 */
module.exports = DRIVER;



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

// N/A

