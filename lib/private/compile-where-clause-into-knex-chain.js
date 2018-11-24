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
        // > Note that knex takes care of "is null"/"is not null" automatically
        // > when using .andWhere() / .orWhere() chainable methods.
        let constraintRhs = scruple[scrupleKey];
        let columnName = scrupleKey;
        // Determine appropriate method to apply the constraint.
        // > The binding is here because of https://github.com/mikermcneil/sails-sql/commit/536bcb18e485b00ba4f7bfe2ec702bfd3b331b2d#commitcomment-31424796
        var applyConstraintFn = _.bind(disjunctMode ? kChain.orWhere : kChain.andWhere, kChain);
        if (_.isObject(constraintRhs)) {
          // Handle complex constraint
          // > We know at this point, since this is a stage 3 query, that there
          // > should never be more than one modifier within a complex constraint.
          let modifierKind = _.keys(constraintRhs)[0];
          let modifierRhs = constraintRhs[modifierKind];
          // Any of the following modifiers might exist in a stage 3 query:
          switch(modifierKind) {
            case    '<': applyConstraintFn(columnName, '<', modifierRhs); break;
            case   '<=': applyConstraintFn(columnName, '<=', modifierRhs); break;
            case    '>': applyConstraintFn(columnName, '>', modifierRhs); break;
            case   '>=': applyConstraintFn(columnName, '>=', modifierRhs); break;
            case   '!=': applyConstraintFn(columnName, '!=', modifierRhs); break;
            case 'like': applyConstraintFn(columnName, 'like', modifierRhs); break;
            case   'in': applyConstraintFn(columnName, 'in', modifierRhs); break;
            case  'nin': applyConstraintFn(columnName, 'not in', modifierRhs); break;
            default: throw new Error(`Specified modifier "${modifierKind}" is not supported in stage 3 queries.`);
          }
        } else {
          // Handle equivalency constraint
          applyConstraintFn(columnName, constraintRhs);
        }

      } else {
        //  ██████╗ ██████╗ ███████╗██████╗ ██╗ ██████╗ █████╗ ████████╗███████╗
        //  ██╔══██╗██╔══██╗██╔════╝██╔══██╗██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╗
        //  ██████╔╝██████╔╝█████╗  ██║  ██║██║██║     ███████║   ██║   █████╗  ╚═╝
        //  ██╔═══╝ ██╔══██╗██╔══╝  ██║  ██║██║██║     ██╔══██║   ██║   ██╔══╝  ██╗
        //  ██║     ██║  ██║███████╗██████╔╝██║╚██████╗██║  ██║   ██║   ███████╗╚═╝
        //  ╚═╝     ╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
        // Handle "and"/"or" predicate set
        let conjunctsOrDisjuncts = scruple[scrupleKey];
        kChain.where((parenthetical)=>{
          for (let i=0; i<conjunctsOrDisjuncts.length; i++) {
            $recurse(conjunctsOrDisjuncts[i], parenthetical, recursionDepth+1, scrupleKey === 'or');
          }//∞
        });
      }//ﬁ </ constraint vs. predicate >
    })(whereClause, kChain, 0);//®
  }//ﬁ

  return kChain;
};//ƒ

