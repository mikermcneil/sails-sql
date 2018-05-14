/**
 * Module dependencies
 */

var flaverr = require('flaverr');
var getIsValidConnection = require('./get-is-valid-connection');


/**
 * helpSendNativeQuery()
 *
 *
 * @async
 * @param  {Ref} connection
 * @param  {String} nativeQuery
 * @param  {Dictionary?} valuesToEscape
 * @param  {Dictionary} meta
 * @return {Ref}
 *         @property {Ref} result
 *         @property {Ref?} meta
 *
 * @throws {Error} E_BAD_CONNECTION
 */
module.exports = async function helpSendNativeQuery(connection, nativeQuery, valuesToEscape, meta) {

  // Validate connection
  if (!getIsValidConnection(connection)) {
    throw flaverr('E_BAD_CONNECTION', new Error());
  }//•

  throw new Error('TODO');

};
