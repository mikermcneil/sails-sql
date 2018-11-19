var assert = require('assert');
var adapter = require('../');

var DRY_ORM = {
  models: {
    foo: {
      identity: 'foo',
      tableName: 'the_foo',
      primaryKey: 'id',
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
    });//</it>
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
    });//</it>
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
    });//</it>
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
    });//</it>
    it('should support inserting a record (+"fetch")', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var db = (await adapter.ƒ.getConnection(mgr)).connection;
      var firstResult = await adapter.ƒ.createRecord({
        method: 'create',
        using: 'the_foo',
        newRecord: {
          the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
        }
      }, db, DRY_ORM);
      assert(!firstResult);
      var secondBeep = Date.now()+Math.random();
      var secondResult = await adapter.ƒ.createRecord({
        method: 'create',
        using: 'the_foo',
        newRecord: {
          the_beep: secondBeep//eslint-disable-line camelcase
        },
        meta: { fetch: true }
      }, db, DRY_ORM);
      assert(secondResult);
      assert.equal(secondResult.the_beep, secondBeep);
      await adapter.ƒ.destroyManager(mgr);
    });//</it>
    it('should support batch inserting many records (+"fetch")', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var db = (await adapter.ƒ.getConnection(mgr)).connection;
      var firstResult = await adapter.ƒ.createEachRecord({
        method: 'createEach',
        using: 'the_foo',
        newRecords: [
          {
            the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
          },
          {
            the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
          },
          {
            the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
          },
          {
            the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
          }
        ],
      }, db, DRY_ORM);
      assert(!firstResult);
      var eighthBeep = Date.now()+Math.random();
      var secondResult = await adapter.ƒ.createEachRecord({
        method: 'createEach',
        using: 'the_foo',
        newRecords: [
          {
            the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
          },
          {
            the_beep: eighthBeep//eslint-disable-line camelcase
          },
          {
            the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
          },
          {
            the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
          }
        ],
        meta: { fetch: true }
      }, db, DRY_ORM);
      assert(secondResult);
      assert.equal(secondResult[1].the_beep, eighthBeep);
      await adapter.ƒ.destroyManager(mgr);
    });//</it>
    it('should support running two count queries, with consistent results', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var db = (await adapter.ƒ.getConnection(mgr)).connection;
      var total = await adapter.ƒ.countRecords({ method: 'count', using: 'the_foo', where: {} }, db, DRY_ORM);
      assert(typeof total === 'number');
      await adapter.ƒ.createRecord({
        method: 'create',
        using: 'the_foo',
        newRecord: {
          the_beep: Date.now()+Math.random()//eslint-disable-line camelcase
        }
      }, db, DRY_ORM);
      var newTotal = await adapter.ƒ.countRecords({ method: 'count', using: 'the_foo', where: {} }, db, DRY_ORM);
      assert(typeof newTotal === 'number');
      assert.equal(newTotal, total + 1);
      await adapter.ƒ.destroyManager(mgr);
    });//</it>
    it('should support running two sum queries, with consistent results', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var db = (await adapter.ƒ.getConnection(mgr)).connection;
      var sumTotal = await adapter.ƒ.sumRecords({ method: 'sum', using: 'the_foo', numericAttrName: 'the_beep', where: {} }, db, DRY_ORM);
      assert(typeof sumTotal === 'number');
      var amountToAdd = Date.now()+Math.random();
      await adapter.ƒ.createRecord({
        method: 'create',
        using: 'the_foo',
        newRecord: {
          the_beep: amountToAdd//eslint-disable-line camelcase
        }
      }, db, DRY_ORM);
      var newSumTotal = await adapter.ƒ.sumRecords({ method: 'sum', using: 'the_foo', numericAttrName: 'the_beep', where: {} }, db, DRY_ORM);
      assert(typeof newSumTotal === 'number');
      assert(newSumTotal === sumTotal + amountToAdd);
      await adapter.ƒ.destroyManager(mgr);
    });//</it>
    it('should support running two avg queries, with consistent results', async()=>{
      var mgr = (await adapter.ƒ.createManager(dbUrl)).manager;
      var db = (await adapter.ƒ.getConnection(mgr)).connection;
      var firstAvg = await adapter.ƒ.avgRecords({ method: 'avg', using: 'the_foo', numericAttrName: 'the_beep', where: {} }, db, DRY_ORM);
      assert(typeof firstAvg === 'number');
      var originalNumRecords = await adapter.ƒ.countRecords({ method: 'count', using: 'the_foo', where: {} }, db, DRY_ORM);
      var valInNewRecord = Date.now()+Math.random();
      await adapter.ƒ.createRecord({
        method: 'create',
        using: 'the_foo',
        newRecord: {
          the_beep: valInNewRecord//eslint-disable-line camelcase
        }
      }, db, DRY_ORM);
      var secondAvg = await adapter.ƒ.avgRecords({ method: 'avg', using: 'the_foo', numericAttrName: 'the_beep', where: {} }, db, DRY_ORM);
      assert(typeof secondAvg === 'number');
      var expectedDelta = valInNewRecord/(originalNumRecords+1);
      assert.equal(secondAvg, valInNewRecord > firstAvg  ? (firstAvg+expectedDelta)  : (firstAvg-expectedDelta));
      // ^^e.g. consider a case where original avg is 2, and there are 3 records (with values 1, 2, and 3)
      // If a new record w/ value 1 is added, then the new average becomes 1.75 (i.e. subtract 1/4)
      await adapter.ƒ.destroyManager(mgr);
    });//</it>
  }//∞
});//∂
