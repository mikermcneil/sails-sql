/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');



/**
 * getIsValidConnection()
 *
 * Return whether or not the specified connection is valid.
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
    case 'pg': throw new Error('Support for that dialect is incomplete...  (TODO)');
    case 'mssql': throw new Error('Support for that dialect is incomplete...  (TODO)');
    case 'oracledb': throw new Error('Support for that dialect is incomplete...  (TODO)');
    case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (TODO)');
    default: throw new Error('Unsupported dialect');
  }
};
