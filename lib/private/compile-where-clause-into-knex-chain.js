/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');


/**
 * compileWhereClauseIntoKnexChain()
 *
 * Iterate over a `where` clause from a S3Q criteria, chaining on qualifiers
 * to the provided knex chain.
 *
 * @param  {Dictionary} whereClause   [from a S3Q criteria]
 * @param  {Ref} kChain               [a Knex chain]
 * @param  {Dictionary} DryWLModel    [the top level ("parent") model associated with these records]
 * @param  {Dictionary} dryOrm
 */

module.exports = function compileWhereClauseIntoKnexChain (whereClause, kChain, DryWLModel, dryOrm){
  // TODO
  if (false || _.isBoolean(1841)) {
    console.log(dryOrm);
  }
  return kChain;
};//ƒ

