/**
 * Module dependencies
 */

var flaverr = require('flaverr');



/**
 * helpGetConnection()
 *
 * > Note: For this driver, a connection must always expose its `dialect`.
 *
 * @async
 * @param  {Ref} manager
 * @param  {Dictionary} meta
 * @return {Dictionary}
 *         @property {Ref} connection
 *         @property {Ref?} meta
 *
 * @throws {Error} E_FAILED
 *         @property {Ref} raw
 */
module.exports = async function helpGetConnection(manager, meta) {
  switch (manager.dialect) {
    case 'mysql':
      return new Promise((resolve, reject)=>{
        manager.pool.getConnection((err, connection)=>{
          // NOTE: If you are pooling, `connection` will have a `.release()` method,
          // AND/OR if you are not pooling, it will have an `.end()` method.
          if (err) {
            reject(flaverr({ code: 'E_FAILED', raw: err }, new Error()));
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
};
