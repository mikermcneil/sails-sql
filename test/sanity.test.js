var assert = require('assert');
var adapter = require('../');


describe('sanity', ()=>{
  var dbTestUrls = [
    'mysql://root@localhost/mppg',
    // 'pg://root@localhost/mppg',
    // 'mssql://root@localhost/mppg',
    // 'sqlite3://root@localhost/mppg',
    // 'oracledb://root@localhost/mppg',
  ];
  for (let dbUrl of dbTestUrls) {
    it('should support creating a manager, grabbing connections, releasing one, and then destroying the manager', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var firstConnection = (await adapter.ƒ.getConnection(mgr)).connection;
      await adapter.ƒ.getConnection(mgr);
      await adapter.ƒ.getConnection(mgr);
      await adapter.ƒ.releaseConnection(firstConnection);
      await adapter.ƒ.destroyManager(mgr);
    });
    it('should support querying', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
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
    it('should support transactions', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var db1 = (await adapter.ƒ.getConnection(mgr)).connection;
      await adapter.ƒ.beginTransaction(db1);
      await adapter.ƒ.sendNativeQuery(db1, 'SELECT * FROM notarealtable').tolerate('queryFailed');
      await adapter.ƒ.commitTransaction(db1);
      var db2 = (await adapter.ƒ.getConnection(mgr)).connection;
      await adapter.ƒ.beginTransaction(db2);
      await adapter.ƒ.sendNativeQuery(db2, 'SELECT * FROM notarealtable').tolerate('queryFailed');
      await adapter.ƒ.rollbackTransaction(db2);
      await adapter.ƒ.destroyManager(mgr);
    });
    it('should support auto-migrations', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var db = (await adapter.ƒ.getConnection(mgr)).connection;
      await adapter.ƒ.dropPhysicalModel(db, 'foo');
      await adapter.ƒ.definePhysicalModel(db, 'foo', [
        { columnName: 'id', columnType: 'DOESNT_MATTER', unique: true, autoIncrement: true },
        { columnName: 'beep', columnType: '_number', unique: true },
        { columnName: 'boop', columnType: '_string' },
      ]);
      await adapter.ƒ.setPhysicalSequence(db, 'foo_id_seq', 1000);
      await adapter.ƒ.destroyManager(mgr);
    });
  }//∞
});//∂
