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
 * @param  {Dictionary} unusedDryWLModel    [the top level ("parent") model associated with these records]
 * @param  {Dictionary} unusedDryOrm
 */

module.exports = function compileWhereClauseIntoKnexChain (whereClause, kChain, unusedDryWLModel, unusedDryOrm){

  // Since the provided "where" clause is supposed to be from a stage 3 query,
  // we can assume that it is already fully normalized.  Yet it never hurts to
  // be safe, so we kick things off with a little assertion to make sure we're
  // at least starting from the right place.
  if (!_.isObject(whereClause) || _.isArray(whereClause) || _.isFunction(whereClause) || _.keys(whereClause).length >= 2) {
    throw new Error('A "where" clause in a stage 3 query should always be an empty dictionary or a dictionary with exactly one key.');
  }

  // As long as this isn't an empty "where" clause, then begin recursively
  // iterating over each scruple in the `where` clause from the provided
  // stage 3 query, applying its meaning to knex chain.
  if (_.keys(whereClause).length > 0) {
    // // TODO: remove this hack for testing
    // kChain = kChain.where((parenthetical)=>{
    //   parenthetical.orWhere('the_beep', 77777777);
    //   parenthetical.orWhere('the_beep', 88888888);
    // });
    (function $recurse(scruple, kChain, recursionDepth, disjunctMode){
      var MAX_RECURSION_DEPTH = 25;
      if (recursionDepth > MAX_RECURSION_DEPTH) {
        throw new Error('This "where" clause seems to have a circular reference. Aborted automatically after reaching maximum recursion depth ('+MAX_RECURSION_DEPTH+').');
      }//-•

      // This scruple could represent either a constraint or a predicate.
      let scrupleKey = _.keys(scruple)[0];

      if (scrupleKey !== 'and' && scrupleKey !== 'or') {
        //   ██████╗ ██████╗ ███╗   ██╗███████╗████████╗██████╗  █████╗ ██╗███╗   ██╗████████╗
        //  ██╔════╝██╔═══██╗████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║████╗  ██║╚══██╔══╝██╗
        //  ██║     ██║   ██║██╔██╗ ██║███████╗   ██║   ██████╔╝███████║██║██╔██╗ ██║   ██║   ╚═╝
        //  ██║     ██║   ██║██║╚██╗██║╚════██║   ██║   ██╔══██╗██╔══██║██║██║╚██╗██║   ██║   ██╗
        //  ╚██████╗╚██████╔╝██║ ╚████║███████║   ██║   ██║  ██║██║  ██║██║██║ ╚████║   ██║   ╚═╝
        //   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝

        let constraintRhs = scruple[scrupleKey];
        let columnName = scrupleKey;
        if (_.isObject(constraintRhs)) {
          // Handle complex constraint
          // > We know at this point, since this is a stage 3 query, that there
          // > should never be more than one modifier within a complex constraint.
          console.log('∈ complex constraint', constraintRhs);
          let modifierKind = _.keys(constraintRhs)[0];
          let modifierRhs = constraintRhs[modifierKind];
          console.log(modifierRhs);// TODO
        } else {
          // Handle equivalency constraint
          console.log('∈ eq constraint', constraintRhs);
          if (disjunctMode) {
            kChain.orWhere(columnName, constraintRhs);
          } else {
            kChain.andWhere(columnName, constraintRhs);
          }
        }

      } else {
        //  ██████╗ ██████╗ ███████╗██████╗ ██╗ ██████╗ █████╗ ████████╗███████╗
        //  ██╔══██╗██╔══██╗██╔════╝██╔══██╗██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╗
        //  ██████╔╝██████╔╝█████╗  ██║  ██║██║██║     ███████║   ██║   █████╗  ╚═╝
        //  ██╔═══╝ ██╔══██╗██╔══╝  ██║  ██║██║██║     ██╔══██║   ██║   ██╔══╝  ██╗
        //  ██║     ██║  ██║███████╗██████╔╝██║╚██████╗██║  ██║   ██║   ███████╗╚═╝
        //  ╚═╝     ╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
        if (scrupleKey === 'and') {
          // Handle "and" predicate set
          let conjuncts = scruple[scrupleKey];
          // console.log('∧ AND conjunction');
          kChain.where((parentheticalChain)=>{
            for (let i=0; i<conjuncts.length; i++) {
              $recurse(conjuncts[i], parentheticalChain, recursionDepth+1);
            }//∞
          });
        } else {
          // Handle "or" predicate set
          let disjuncts = scruple[scrupleKey];
          // console.log('∨ OR disjunction');
          kChain.where((parentheticalChain)=>{
            for (let i=0; i<disjuncts.length; i++) {
              $recurse(disjuncts[i], parentheticalChain, recursionDepth+1, true);
            }//∞
          });
        }//ﬁ </ "and" vs. "or" >
      }//ﬁ </ constraint vs. predicate >
    })(whereClause, kChain, 0);//®
  }//ﬁ

  return kChain;
};//ƒ

