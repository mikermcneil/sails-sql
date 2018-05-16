# Sails SQL Adapter

SQL adapter for Node.js/Sails and [Waterline](http://waterlinejs.org). Supports MySQL, PostgreSQL, Microsoft SQL Server (MSSQL), SQLite, & Oracle databases.

> This adapter is compatible with Node ≥8 and up.  For SQL adapters compatible with older versions of Node.js, see legacy adapters [sails-mysql](https://npmjs.com/package/sails-mysql) and [sails-postgresql](https://npmjs.com/package/sails-postgresql).

 
  <a target="_blank" href="http://www.mysql.com"><img src="http://www.mysql.com/common/logos/powered-by-mysql-125x64.png" alt="Powered by MySQL" title="sails-mysql: MySQL adapter for Sails"/></a>
  <a target="_blank" href="https://www.postgresql.org"><img src="https://onioncontainers.com/img/postgres.png" alt="Postgresql Logo" title="sails-postgresql: Postgresql adapter for Sails"/></a>
   <a target="_blank" href="https://www.sqlite.org/index.html"><img src="https://www.sqlite.org/images/sqlite370_banner.gif" alt="SQL Lite" title="SQL Lite: SQL Lite adapter for Sails"/></a>
  <a target="_blank" href="https://www.microsoft.com/en-US/sql-server/sql-server-2017"><img src="http://www.storegrid.co.za/wp-content/uploads/2012/05/256-SQLServer-a.png" alt="Microsoft SQL Logo" title="sails-Microsoft-SQL: Microsoft-SQL-Server adapter for Sails"/></a>


## Acknowledgements

Thanks to [dougwilson](https://github.com/dougwilson) and [felixge](https://github.com/felixge) for all of their great work on [mysql](http://npmjs.com/package/mysql), [@brianc](https://github.com/brianc) for all of his fantastic work on the [`pg`](http://npmjs.com/package/pg) package, and thousands of contributors across the Node.js community that have made this level of simplicity and abstraction possible.

## Help

For more examples, or if you get stuck or have questions, click [here](https://sailsjs.com/support).

## Bugs &nbsp; [![NPM version](https://badge.fury.io/js/sails-sql.svg)](http://npmjs.com/package/sails-sql)

To report a bug, [click here](https://sailsjs.com/bugs).


## Contributing &nbsp; [![Build Status](https://travis-ci.org/sailshq/sails-sql.svg?branch=master)](https://travis-ci.org/sailshq/sails-sql)

Please observe the guidelines and conventions laid out in the [Sails project contribution guide](https://sailsjs.com/contribute) when opening issues or submitting pull requests.

[![NPM](https://nodei.co/npm/sails-sql.png?downloads=true)](http://npmjs.com/package/sails-sql)

## License

MIT &copy; 2018-present [Mike McNeil](https://twitter.com/mikermcneil)

This package, like the [Sails framework](https://sailsjs.com), is free and open-source under the [MIT License](https://sailsjs.com/license).


## Implementor notes (advanced)

### About MySQL
Support for different types of managers is database-specific, and is not
built into the Waterline driver spec-- however this type of configurability
can be instrumented using `meta`.

In particular, support for ad-hoc connections (i.e. no pool) and clusters/multiple
pools (see "PoolCluster": https://github.com/felixge/node-mysql/blob/v2.10.2/Readme.md#poolcluster)
could be implemented here, using properties on `meta` to determine whether or not
to have this manager produce connections ad-hoc, from a pool, or from a cluster of pools.

Feel free to fork this driver and customize as you see fit.  Also note that
contributions to the core driver in this area are welcome and greatly appreciated!

Also note that if this driver is adapted to support managers which spawn
ad-hoc connections or manage multiple pools/replicas using PoolCluster,
then relevant settings would need to be included in the manager instance
so that the manager could be appropriately destroyed here (in the case of
ad-hoc connections, leased connections would need to be tracked on the
manager, and then rounded up and disconnected here.)

For now, since we only support a single pool, we simply destroy it.

For more info, see https://github.com/felixge/node-mysql/blob/v2.10.2/Readme.md#closing-all-the-connections-in-a-pool

### About getConnection()

Note that if this driver is adapted to support managers which spawn
ad-hoc connections or manage multiple pools/replicas using PoolCluster,
then relevant settings would need to be included in the manager instance
so that connections can be appropriately fetched/opened here.
For now, since we only support a single pool, we simply acquire a
connection from the pool.

### About releaseConnection()

Note that if this driver is adapted to support managers which spawn
ad-hoc connections or manage multiple pools/replicas using PoolCluster,
then relevant settings would need to be included in the manager instance
so that connections can be appropriately released/destroyed in releaseConnection.

For now, since we only support a single pool, we simply release the
connection back to the pool. And if the connection cannot be released back to
the pool gracefully, we try to force it to disconnect.

If releaseConnection() succeeds, then we were either able to release
the connection gracefully (i.e. worked on the first try), or that we
had to try again, forcibly destroying the connection.
