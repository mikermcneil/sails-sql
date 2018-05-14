/**
 * Module dependencies
 */

var flaverr = require('flaverr');
var getIsValidConnection = require('./get-is-valid-connection');



/**
 * helpReleaseConnection()
 *
 * > Note: below we first check some basic assertions about the provided connection.
 * > (this doesn't guarantee it's still active or anything, but it does let
 * > us know that it at least _HAS_ the properly formatted methods and properties
 * > necessary for internal use in this Waterline driver)
 *
 * @async
 * @param  {Ref} connection
 * @param  {Dictionary} meta
 * @return {Dictionary}
 *         @property {Ref?} meta
 *
 * @throws {Error} E_BAD_CONNECTION
 */
module.exports = async function helpReleaseConnection(connection, meta) {

  // Validate connection
  if (!getIsValidConnection(connection)) {
    throw flaverr('E_BAD_CONNECTION', new Error());
  }//•

  // Release
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
};
