var assert = require('assert');
var adapter = require('../');


describe('sanity', ()=>{
  var TEST_DB_URL = 'mysql://root@localhost/mppg';
  // var TEST_DB_URL = 'pg://root@localhost/mppg';
  // var TEST_DB_URL = 'mssql://root@localhost/mppg';
  // var TEST_DB_URL = 'sqlite3://root@localhost/mppg';
  // var TEST_DB_URL = 'oracledb://root@localhost/mppg';

  it('should support creating a manager, grabbing connections, releasing one, and then destroying the manager', async()=>{
    var mgr = (await adapter.ƒ.createManager(TEST_DB_URL)).manager;
    var firstConnection = (await adapter.ƒ.getConnection(mgr)).connection;
    await adapter.ƒ.getConnection(mgr);
    await adapter.ƒ.getConnection(mgr);
    await adapter.ƒ.releaseConnection(firstConnection);
    await adapter.ƒ.destroyManager(mgr);
  });
  it('should support querying', async()=>{
    var mgr = (await adapter.ƒ.createManager(TEST_DB_URL)).manager;
    var db = (await adapter.ƒ.getConnection(mgr)).connection;
    var queryFailureErr;
    await adapter.ƒ.sendNativeQuery(db, 'SELECT * FROM notarealtable')
    .tolerate('queryFailed', (err)=>{
      let report = err.raw;
      queryFailureErr = report.error;
    });
    assert(queryFailureErr);
    assert.equal('noSuchPhysicalModel', (await adapter.ƒ.parseNativeQueryError(queryFailureErr)).footprint.identity);
    await adapter.ƒ.destroyManager(mgr);
  });
});
