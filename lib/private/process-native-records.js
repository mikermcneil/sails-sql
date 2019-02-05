/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var WLUtils = require('waterline-utils');


/**
 * processNativeRecords()
 *
 * Normalize an array of database-native physical records by modifying
 * them in-place, polishing away any dialect-specific and adapter-specific
 * characteristics.
 *
 * @param  {Array} phRecords            [physical records]
 * @param  {String} dialect             [the SQL dialect]
 * @param  {String} parentModelIdentity [the model identity of the top level of these physical records]
 * @param  {Dictionary} dryOrm
 */
module.exports = function processNativeRecords (phRecords, dialect, parentModelIdentity, dryOrm){
  WLUtils.eachRecordDeep(phRecords, (phRecord, DryWLModel)=>{
    for (let attrName in DryWLModel.attributes) {
      let attrDef = DryWLModel.attributes[attrName];
      let columnName = attrDef.columnName;
      if (phRecord[columnName] === undefined) { continue; }//•
      let raw = phRecord[columnName];
      switch (dialect) {
        //  ╔╦╗╦ ╦╔═╗╔═╗ ╦
        //  ║║║╚╦╝╚═╗║═╬╗║
        //  ╩ ╩ ╩ ╚═╝╚═╝╚╩═╝
        case 'mysql':
          if (attrDef.type === 'boolean') {
            // Because MySQL returns these as either 0 or 1, data for this boolean
            // attribute must be transformed back into its corresponding true/false value.
            // [?] https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/query/process-each-record.js#L50-L66
            switch (raw) {
              case 0: phRecord[columnName] = false; break;
              case 1: phRecord[columnName] = true; break;
            }
          } else if (attrDef.type === 'json') {
            // Parse stringified JSON (unless it's already `null`, in which case we leave it undefined)
            // Note that we also tolerate empty string, even though type:'json' data would never be set that way through normal ORM usage.
            // [?] https://github.com/balderdashy/sails-mysql/blob/e9ca5d0d55fee6fbfe662597eb7dd291ffbcb323/helpers/private/query/process-each-record.js#L68-L78
            if (!_.isNull(raw) && raw !== '') {
              try {
                phRecord[columnName] = JSON.parse(raw);
              } catch (err) {
                throw flaverr({
                  message: 'Could not parse raw data from database as JSON.  (Tip: This might mean that some corrupted data ended up in your database.  But another common reason for this error is because the database automatically/silently truncated data because it was too long.  If you are unsure, check that this column has a physical column type capable of storing enough bytes.)  Original error details: '+err.message,
                }, err);
              }
            }
          }//ﬁ
          break;
        //  ╔═╗╔═╗╔═╗╔╦╗╔═╗╦═╗╔═╗╔═╗
        //  ╠═╝║ ║╚═╗ ║ ║ ╦╠╦╝║╣ ╚═╗
        //  ╩  ╚═╝╚═╝ ╩ ╚═╝╩╚═╚═╝╚═╝
        case 'pg':
          // Check if the record and the model contain auto timestamps and make
          // sure that if they are type number that they are actually numbers and
          // not strings.
          // [?] https://github.com/balderdashy/sails-postgresql/blob/881275fc999e680f517eb4dccbc99a7bb3dbe1ce/helpers/private/query/process-each-record.js#L50-L67
          if (attrDef.type === 'number' && (attrDef.autoUpdatedAt||attrDef.autoCreatedAt)) {
            phRecord[columnName] = Number(raw);
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
  }, true, parentModelIdentity, dryOrm);
};//ƒ
