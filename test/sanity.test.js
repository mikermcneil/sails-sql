var assert = require('assert');
var adapter = require('../');

var DRY_ORM = {
  models: {
    foo: {
      tableName: 'the_foo',
      attributes: {
        id: {
          columnName: 'the_id',
          autoMigrations: { columnType: 'DOESNT_MATTER', unique: true, autoIncrement: true },
        },
        beep: {
          columnName: 'the_beep',
          required: true,
          autoMigrations: { columnName: 'beep', columnType: '_number', unique: true },
        },
        boop: {
          columnName: 'the_boop',
          autoMigrations: { columnName: 'boop', columnType: '_string' }
        }
      }//</.attributes>
    }//</.foo>
  }//</.models>
};//</DRY_ORM>

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
      await adapter.ƒ.dropPhysicalModel(db, 'the_foo');
      await adapter.ƒ.definePhysicalModel(db, 'the_foo', [
        { columnName: 'the_id', columnType: 'DOESNT_MATTER', unique: true, autoIncrement: true },
        { columnName: 'the_beep', columnType: '_number', unique: true },
        { columnName: 'the_boop', columnType: '_string' },
      ]);
      await adapter.ƒ.setPhysicalSequence(db, 'the_foo_id_seq', 1000);
      await adapter.ƒ.destroyManager(mgr);
    });
    it('should support inserting a record', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var db = (await adapter.ƒ.getConnection(mgr)).connection;
      await adapter.ƒ.createRecord({
        method: 'create',
        using: 'the_foo',
        newRecord: {
          the_beep: Math.round((Date.now()+(100*Math.random()))/100000)//eslint-disable-line camelcase
        }
      }, db, DRY_ORM);
      await adapter.ƒ.destroyManager(mgr);
    });
    it.skip('should support batch inserting many records', async()=>{
      // TODO
    });
  }//∞
});//∂
