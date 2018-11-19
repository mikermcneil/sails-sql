/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');



/**
 * getIsValidConnection()
 *
 * Return whether or not the specified connection is valid.
 *
 * > Note: Here we mean "connection" as in the "connection" defined by the
 * > Node-Machine/Waterline driver interface, that is used by driver methods
 * > like "releaseConnection", etc.
 * > @see http://npmjs.com/package/driver-interface
 *
 * @param  {Dictionary} connection
 *   @property {String} dialect
 * @return {Boolean}
 */
module.exports = function getIsValidConnection(connection) {
  switch (connection.dialect) {
    case 'mysql':
      return (
        _.isObject(connection) && _.isFunction(connection.query) && _.isFunction(connection.destroy) &&
        (_.isFunction(connection.release) || _.isFunction(connection.end))
      );
    case 'pg': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
    case 'mssql':
      throw new Error('Support for that dialect is incomplete...  (FUTURE)');
    case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
    case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
    default: throw new Error('Unsupported dialect');
  }
};
