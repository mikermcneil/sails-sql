/**
 * Module dependencies
 */

var knex = require('knex');


/**
 * initializeKnex()
 *
 * @param  {String} dialect
 * @return {Ref}
 */
module.exports = function initializeKnex(dialect) {

  return knex({
    client: dialect,
    asyncStackTraces: process.env.NODE_ENV !== 'production' || process.env.DEBUG
  });

};//ƒ
