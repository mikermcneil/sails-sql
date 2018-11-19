/**
 * Module dependencies
 */

// N/A


/**
 * runNativeQuery()
 *
 * Send a native query (or template w/ bindings) to the database using the
 * provided driver and pre-existing database connection.  If an error occurs,
 * and it's because the query failed, then use database-specific error sniffing
 * to try to match that error against one of the standardized footprints, then
 * either way, attach a `footprint` property to the resulting error instance.
 * (Note that misc. errors unrelated to query failure will not necessarily have
 * a `.footprint` property.)
 *
 * > Note: This utility exists mainly because doing this sending and error
 * > negotiation by hand is a bit tedious and repetitive, even though there are
 * > two special driver methods for doing these tasks.  This way, you only have
 * > to call one thing, and it ends up being much cleaner, while still also
 * > allowing granular, low-level access to the building blocks (if desired).
 *
 * @param  {String} nativeQueryTpl       [e.g. a SQL string or SQL template]
 * @param  {Dictionary} valuesToEscape   [a dictionary of values to escape and use in the native query template]
 * @param  {Ref} connection
 * @param  {Dictionary?} meta
 * @param  {Dictionary} DRIVER           [a direct reference to the driver itself]
 */

module.exports = async function runNativeQuery (nativeQueryTpl, valuesToEscape, connection, meta, DRIVER){
  // console.log('DEBUG :: '+nativeQueryTpl, valuesToEscape);
  // FUTURE: some kind of native query logging
  try {
    return (await DRIVER.sendNativeQuery({ nativeQuery: nativeQueryTpl, valuesToEscape, connection, meta })).result;
  } catch (errOrSignal) {
    if (errOrSignal.queryFailed) {
      let report = errOrSignal.queryFailed;
      let footprint = (DRIVER.parseNativeQueryError({ nativeQueryError: report.error, meta })).footprint;
      report.error.footprint = footprint;
      throw report.error;
    } else {
      throw errOrSignal;
    }
  }
};//ƒ
