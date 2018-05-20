var adapter = require('../');

var TEST_DB_URL = 'mysql://root@localhost/mppg';

describe('sanity', ()=>{
  it('should support creating a manager, grabbing connections, releasing one, and then destroying the manager', async()=>{
    var mgr = (await adapter.ƒ.createManager(TEST_DB_URL)).manager;
    var firstConnection = (await adapter.ƒ.getConnection(mgr)).connection;
    await adapter.ƒ.getConnection(mgr);
    await adapter.ƒ.getConnection(mgr);
    await adapter.ƒ.releaseConnection(firstConnection);
    await adapter.ƒ.destroyManager(mgr);
  });
});
