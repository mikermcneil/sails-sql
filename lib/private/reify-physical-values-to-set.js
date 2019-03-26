/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');


/**
 * reifyPhysicalValuesToSet()
 *
 * Modify the provided dictionary of physical values so that they have the
 * appropriate database-specific changes for the given dialect.
 *
 * > Also strip out property representing pk value, if set to `null`.
 * > (See below for more information.)
 *
 * @param  {Dictionary} phValuesToSet
 * @param  {String} dialect           [the SQL dialect]
 * @param  {Dictionary} DryWLModel    [the model associated with these records]
 */
module.exports = function reifyPhysicalValuesToSet (phValuesToSet, dialect, DryWLModel){
  let pkColumnName = DryWLModel.attributes[DryWLModel.primaryKey].columnName;
  if (phValuesToSet[pkColumnName] === null) {
    // If left unspecified, the primary key value comes through from Waterline
    // as `null`.  In that scenario, we'll delete it from our final set of values
    // to set so that we don't inadvertently cause errors or unexpected behavior
    // in our underlying db client library.
    delete phValuesToSet[pkColumnName];
  }//ﬁ

  for (let attrName in DryWLModel.attributes) {
    let attrDef = DryWLModel.attributes[attrName];
    let columnName = attrDef.columnName;
    if (phValuesToSet[columnName] === undefined) {
      continue;
    }//•
    let raw = phValuesToSet[columnName];
    switch (dialect) {
      //  ╔╦╗╦ ╦╔═╗╔═╗ ╦
      //  ║║║╚╦╝╚═╗║═╬╗║
      //  ╩ ╩ ╩ ╚═╝╚═╝╚╩═╝
      case 'mysql':
        if (attrDef.type === 'json') {
          // Stringify any value provided for this `type: 'json'` attribute because
          // MySQL can't store JSON.  (Unless this is the `null` literal, in which
          // case we leave it alone.)
          // [?] https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/query/pre-process-record.js#L76-L81
          if (!_.isNull(raw)) {
            phValuesToSet[columnName] = JSON.stringify(raw);
          }
        }//ﬁ
        break;
      //  ╔═╗╔═╗╔═╗╔╦╗╔═╗╦═╗╔═╗╔═╗
      //  ╠═╝║ ║╚═╗ ║ ║ ╦╠╦╝║╣ ╚═╗
      //  ╩  ╚═╝╚═╝ ╩ ╚═╝╩╚═╚═╝╚═╝
      case 'pg':
        if (attrDef.type === 'json') {
          // Stringify the value provided for this `type: 'json'` attribute if
          // its a type of data that PostgreSQL doesn't store/retrieve consistently
          // alongside JSON dictionaries, or if retrieval would otherwise be inconsistent.
          // [?] https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/private/query/pre-process-each-record.js#L58-L64
          if (_.isArray(raw) || _.isString(raw)) {
            phValuesToSet[columnName] = JSON.stringify(raw);
          }

          // For attributes using the "BIGINT" column type, coerce empty string to zero.
          // This allows use of `type: 'string'` with BIGINT, which we want because the pg driver
          // returns BIGINTs as strings.  And since the regular INT field in postgres is too small
          // to hold e.g. attributes that hold custom JS timestamps, users are forced to use
          // BIGINT to hold that data.  This makes that work neatly.
          // [?] https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/private/query/pre-process-each-record.js#L66-L72
          let isBigintColumn = !!(attrDef.autoMigrations && attrDef.autoMigrations.columnType.match(/^BIGINT$/i));
          if (raw === '' && isBigintColumn) {
            phValuesToSet[columnName] = 0;
          }
        }//ﬁ
        break;
      //  ╔═╗╔═╗ ╦    ╔═╗╔═╗╦═╗╦  ╦╔═╗╦═╗
      //  ╚═╗║═╬╗║    ╚═╗║╣ ╠╦╝╚╗╔╝║╣ ╠╦╝
      //  ╚═╝╚═╝╚╩═╝  ╚═╝╚═╝╩╚═ ╚╝ ╚═╝╩╚═
      case 'mssql':
        // TODO
        break;
      case 'oracledb': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      case 'sqlite3': throw new Error('Support for that dialect is incomplete...  (FUTURE)');
      default: throw new Error('Unsupported dialect');
    }
  }//∞
};//ƒ
