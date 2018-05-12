





### MySQL notes
Support for different types of managers is database-specific, and is not
built into the Waterline driver spec-- however this type of configurability
can be instrumented using `meta`.

In particular, support for ad-hoc connections (i.e. no pool) and clusters/multiple
pools (see "PoolCluster": https://github.com/felixge/node-mysql/blob/v2.10.2/Readme.md#poolcluster)
could be implemented here, using properties on `meta` to determine whether or not
to have this manager produce connections ad-hoc, from a pool, or from a cluster of pools.

Feel free to fork this driver and customize as you see fit.  Also note that
contributions to the core driver in this area are welcome and greatly appreciated!
