/**
 * Module dependencies
 */

var util = require('util');
// var debug = require('debug')('query');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var knex = require('knex');
var WLUtils = require('waterline-utils');
var getIsValidConnection = require('./get-is-valid-connection');
var requireDbLibrary = (dialect)=>{
  switch (dialect) {
    case 'mysql': return require('mysql');
    case 'pg': return require('pg');
    case 'mssql': return require('mssql');
    case 'oracledb': return require('oracledb');
    case 'sqlite3': return require('sqlite3');
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
   * @see http://npmjs.com/package/driver-interface
   *
   * Note: For this driver, a manager must always expose its `dialect`.
   *
   * @meta {String?} dialect
   * @meta {Ref?} dbLibrary
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

    switch (dialect) {
      case 'mysql':
        // Create a connection pool.
        //
        // More about using pools with node-mysql:
        //  • https://github.com/mysqljs/mysql/blob/v2.15.0/Readme.md#pooling-connections
        let pool = dbLibrary.createPool(underlyingDbLibraryConfig);

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
            if (flaverr.parseError(err)) {
              err = flaverr({ raw: err, message }, err);
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

      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  destroyManager: async function({manager, meta}) {
    if (!meta) { meta = {}; }

    switch (manager.dialect) {
      case 'mysql':
        return await new Promise((resolve, reject)=>{
          manager.pool.end((err)=>{
            if (flaverr.parseError(err)) {
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
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   *
   * > Note: For this driver, a connection must always expose its `dialect`.
   */
  getConnection: async function({manager, meta}) {
    if (!meta) { meta = {}; }

    switch (manager.dialect) {
      case 'mysql':
        return await new Promise((resolve, reject)=>{
          manager.pool.getConnection((err, connection)=>{
            // NOTE: If you are pooling, `connection` will have a `.release()` method,
            // AND/OR if you are not pooling, it will have an `.end()` method.
            if (flaverr.parseError(err)) {
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
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error(`Unsupported dialect "${manager.dialect}"`);
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
    if (!meta) { meta = {}; }

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

      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
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
    if (!meta) { meta = {}; }
    if (!getIsValidConnection(connection)) {
      throw {badConnection: {meta}};
    }//•

    try {
      switch (connection.dialect) {
        case 'mysql':
          return await new Promise((resolve, reject)=>{
            connection.query({
              sql: nativeQuery,
              values: valuesToEscape
            }, (err, cbArg2, cbArg3)=>{
              if (err) {
                let report = { error: err, meta };
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
          });//•_∏_
        case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
        case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
        case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
        case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
        default: throw new Error('Unsupported dialect');
      }
    } catch (errOrSignal) {
      // If exiting queryFailed, give the error a `.dialect`.
      if (errOrSignal.queryFailed) {//« exit signal
        let report = errOrSignal.queryFailed;
        let error = report.error;
        error.dialect = connection.dialect;
      }//>-
      throw errOrSignal;
    }
  },

  /**
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

    switch (nativeQueryError.dialect) {
      case 'mysql':
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
          // Now build our footprint's `keys` property by manually parsing the MySQL error message and extracting the relevant bits.
          // (See also: https://github.com/balderdashy/sails-mysql/blob/2c414f1191c3595df2cea8e40259811eb3ca05f9/lib/adapter.js#L1223)
          if (_.isString(nativeQueryError.message)) {
            let matches = nativeQueryError.message.match(/Duplicate entry '.*' for key '(.*?)'$/);
            if (matches && matches.length > 0) {
              footprint.keys.push(matches[1]);
            }
          }
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

      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
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
    if (!meta) { meta = {}; }
    if (!getIsValidConnection(connection)) {
      let report = {meta};
      throw {badConnection: report};
    }//•

    try {
      switch (connection.dialect) {
        case 'mysql':
        case 'pg':
        case 'mssql':
        case 'sqlite3':
          await DRIVER.sendNativeQuery({
            nativeQuery: 'BEGIN',
            connection,
            meta
          });
          break;
        case 'oracledb':
          // For oracle, use START TRANACTION instead, because "BEGIN" has the
          // side-effect of causing auto-commit mode to become a thing
          await DRIVER.sendNativeQuery({
            nativeQuery: 'START TRANSACTION',
            connection,
            meta
          });
          break;
        default: throw new Error('Unsupported dialect');
      }
    } catch (errOrSignal) {
      if (errOrSignal.queryFailed) {
        let report = errOrSignal.queryFailed;
        report.error.footprint = (DRIVER.parseNativeQueryError({ nativeQueryError: report.error, meta })).footprint;
        throw report.error;
      } else {
        throw errOrSignal;
      }
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
        try {
          await DRIVER.sendNativeQuery({
            nativeQuery: 'COMMIT',
            connection,
            meta
          });
        } catch (errOrSignal) {
          if (errOrSignal.queryFailed) {
            let report = errOrSignal.queryFailed;
            report.error.footprint = (DRIVER.parseNativeQueryError({ nativeQueryError: report.error, meta })).footprint;
            throw report.error;
          } else {
            throw errOrSignal;
          }
        }
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
        try {
          await DRIVER.sendNativeQuery({
            nativeQuery: 'ROLLBACK',
            connection,
            meta
          });
        } catch (errOrSignal) {
          if (errOrSignal.queryFailed) {
            let report = errOrSignal.queryFailed;
            report.error.footprint = (DRIVER.parseNativeQueryError({ nativeQueryError: report.error, meta })).footprint;
            throw report.error;
          } else {
            throw errOrSignal;
          }
        }
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
  verifyModelDef: async function({modelDef}) {
    if (!this.dialect) {
      throw new Error(
        'To use verifyModelDef() with this package, it must be invoked with its SQL dialect declared under the `dialect` meta key.  '+
        'For example: `await verifyModelDef(WLModel).meta({dialect: \'mysql\'});`'
      );
    }

    // Ensure that the model's primary key is either required or auto-incrementing.
    // https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/register-data-store.js#L110-L113
    var primaryKeyAttrDef = modelDef.attributes[modelDef.primaryKey];
    if (primaryKeyAttrDef.required !== true && (!primaryKeyAttrDef.autoMigrations || primaryKeyAttrDef.autoMigrations.autoIncrement !== true)) {
      throw {invalid: new Error(`In model "${modelDef.identity}", the primary key attribute is not valid for this adapter.  (It should be either required, or auto-incrementing.)`)};
    }

    switch (this.dialect) {
      case 'mysql': break;
      case 'pg':
        // Ensure that no attributes declare themselves both columnType: 'BIGINT' & type: 'number' (except for auto-timestamps)
        // https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/register-data-store.js#L110-L125
        for (let attrName in modelDef.attributes) {
          let attrDef = modelDef.attributes[attrName];
          let isBigInt = (attrDef.autoMigrations && attrDef.autoMigrations.columnType === 'bigint');
          if (isBigInt && attrDef.type === 'number' && !attrDef.autoCreatedAt && !attrDef.autoUpdatedAt) {
            throw {invalid: new Error(`In attribute "${attrName}" of model "${modelDef.identity}", the columnType: \'bigint\' cannot be used alongside type: 'number'.  Since "bigint" values may be larger than the maximum JavaScript integer size, PostgreSQL will return them as strings.  Therefore, attributes using this column type should be declared as type: 'string'.`)};
          }
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
    switch (connection.dialect) {
      case 'mysql':
        throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  createEachRecord: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  updateRecords: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  destroyRecords: async function({query, connection, dryOrm}) {
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  findRecords: async function({query, connection, dryOrm}) {
    // TODO: support row-locking
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  countRecords: async function({query, connection, dryOrm}) {
    // TODO: support row-locking
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  sumRecords: async function({query, connection, dryOrm}) {
    // TODO: support row-locking
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  avgRecords: async function({query, connection, dryOrm}) {
    // TODO: support row-locking
    switch (connection.dialect) {
      case 'mysql': throw new Error('Support for that dialect is incomplete...  (TODO)');
      case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
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
  definePhysicalModel: async function({connection, tableName, columns, meta}) {
    let nativeQueries = (knex({ client: connection.dialect }).schema.createTable(tableName, (kTable)=>{
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
          kTable.increments(column.columnName);
          // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          // ^^ FUTURE: (Maybe.)  Add support for custom column types for autoincrement
          // Note this is more about supporting pg's BIGSERIAL and less about non-numeric
          // autoincrement strategies (e.g. https://github.com/balderdashy/sails-postgresql/pull/278)
          // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        } else {
          let computedColumnType;
          switch (column.columnType.toLowerCase()) {
            // Reserved (auto-migrations):
            case '_number':          computedColumnType = 'REAL'; break;
            case '_numberkey':       computedColumnType = 'INTEGER'; break;
            case '_numbertimestamp': computedColumnType = 'BIGINT'; break;
            case '_string':          computedColumnType = connection.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'; break;
            case '_stringkey':       computedColumnType = connection.dialect === 'mysql' ? 'VARCHAR(255)' : 'VARCHAR'; break;
            case '_stringtimestamp': computedColumnType = connection.dialect === 'mysql' ? 'VARCHAR(255)' : 'VARCHAR'; break;
            case '_boolean':         computedColumnType = 'BOOLEAN'; break;
            case '_json':            computedColumnType = connection.dialect === 'mysql' ? 'LONGTEXT' : 'JSON'; break;
            case '_ref':             computedColumnType = connection.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'; break;
            // Common:
            case 'json':             computedColumnType = connection.dialect === 'mysql' ? 'LONGTEXT' : 'JSON'; break;
            case 'varchar':          computedColumnType = connection.dialect === 'mysql' ? 'VARCHAR(255)' : 'VARCHAR'; break;
            // Misc:
            default:                 computedColumnType = column.columnType;
          }
          let chain = kTable.specificType(column.columnName, computedColumnType);
          if (column.unique) {
            chain.unique();
          }
        }
      }//∞
    }).toSQL());
    try {
      for (let qInfo of nativeQueries) {
        await DRIVER.sendNativeQuery({
          connection,
          nativeQuery: qInfo.sql,
          valuesToEscape: qInfo.bindings,
          meta
        });
      }//∞
    } catch (errOrSignal) {
      if (errOrSignal.queryFailed) {
        let report = errOrSignal.queryFailed;
        report.error.footprint = (DRIVER.parseNativeQueryError({ nativeQueryError: report.error, meta })).footprint;
        throw report.error;
      } else {
        throw errOrSignal;
      }
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  dropPhysicalModel: async function({connection, tableName, meta}) {
    switch (connection.dialect) {
      case 'mysql':
      case 'pg':
      case 'mssql':
      case 'oracledb':
      case 'sqlite3':
        let nativeQueries = (knex({ client: connection.dialect }).schema.dropTable(tableName).toSQL());
        try {
          for (let qInfo of nativeQueries) {
            await DRIVER.sendNativeQuery({
              connection,
              nativeQuery: qInfo.sql,
              valuesToEscape: qInfo.bindings,
              meta
            });
          }//∞
        } catch (errOrSignal) {
          if (errOrSignal.queryFailed) {
            let report = errOrSignal.queryFailed;
            let footprint = (DRIVER.parseNativeQueryError({ nativeQueryError: report.error, meta })).footprint;
            if (footprint.identity === 'noSuchPhysicalModel') {
              // If this error is just indicating that the table doesn't exist,
              // then simply ignore it.  (We silently tolerate this sort of thing.)
              return;//•
            } else {
              report.error.footprint = footprint;
              throw report.error;
            }
          } else {
            throw errOrSignal;
          }
        }
        break;
      default: throw new Error('Unsupported dialect');
    }
  },

  /**
   * @see http://npmjs.com/package/driver-interface
   */
  setPhysicalSequence: async function({connection, sequenceName, sequenceValue, meta}) {
    switch (connection.dialect) {
      case 'mysql': return;// No-op
      case 'pg':
        console.log(sequenceName, sequenceValue, meta);
        // FUTURE: special postgresql implementation (see https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/set-sequence.js#L73-L117)
        throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'mssql':
      case 'oracledb':
      case 'sqlite3':
        throw new Error('Support for that dialect is incomplete...  (FUTURE)');
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
