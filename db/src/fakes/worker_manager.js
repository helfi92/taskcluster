const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require('../utils');

class FakeWorkerManager {
  constructor() {
    this.wmWorkers = new Set();
    this.wmWorkerPools = new Set();
    this.wmWorkerPoolErrors = new Set();
  }

  /* helpers */

  reset() {
    this.wmWorkers = new Set();
    this.wmWorkerPools = new Set();
    this.wmWorkerPoolErrors = new Set();
  }

  _getWmWorker({ partitionKey, rowKey }) {
    for (let c of [...this.wmWorkers]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeWmWorker({ partitionKey, rowKey }) {
    for (let c of [...this.wmWorkers]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.wmWorkers.delete(c);
        break;
      }
    }
  }

  _addWmWorker(wmWorker) {
    assert(typeof wmWorker.partition_key === "string");
    assert(typeof wmWorker.row_key === "string");
    assert(typeof wmWorker.value === "object");
    assert(typeof wmWorker.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: wmWorker.partition_key,
      row_key_out: wmWorker.row_key,
      value: wmWorker.value,
      version: wmWorker.version,
      etag,
    };

    this._removeWmWorker({ partitionKey: wmWorker.partition_key, rowKey: wmWorker.row_key });
    this.wmWorkers.add(c);

    return c;
  }

  _getWmWorkerPool({ partitionKey, rowKey }) {
    for (let c of [...this.wmWorkerPools]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeWmWorkerPool({ partitionKey, rowKey }) {
    for (let c of [...this.wmWorkerPools]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.wmWorkerPools.delete(c);
        break;
      }
    }
  }

  _addWmWorkerPool(wmWorkerPool) {
    assert(typeof wmWorkerPool.partition_key === "string");
    assert(typeof wmWorkerPool.row_key === "string");
    assert(typeof wmWorkerPool.value === "object");
    assert(typeof wmWorkerPool.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: wmWorkerPool.partition_key,
      row_key_out: wmWorkerPool.row_key,
      value: wmWorkerPool.value,
      version: wmWorkerPool.version,
      etag,
    };

    this._removeWmWorkerPool({ partitionKey: wmWorkerPool.partition_key, rowKey: wmWorkerPool.row_key });
    this.wmWorkerPools.add(c);

    return c;
  }

  _getWmWorkerPoolError({ partitionKey, rowKey }) {
    for (let c of [...this.wmWorkerPoolErrors]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeWmWorkerPoolError({ partitionKey, rowKey }) {
    for (let c of [...this.wmWorkerPoolErrors]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.wmWorkerPoolErrors.delete(c);
        break;
      }
    }
  }

  _addWmWorkerPoolError(wmWorkerPoolError) {
    assert(typeof wmWorkerPoolError.partition_key === "string");
    assert(typeof wmWorkerPoolError.row_key === "string");
    assert(typeof wmWorkerPoolError.value === "object");
    assert(typeof wmWorkerPoolError.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: wmWorkerPoolError.partition_key,
      row_key_out: wmWorkerPoolError.row_key,
      value: wmWorkerPoolError.value,
      version: wmWorkerPoolError.version,
      etag,
    };

    this._removeWmWorkerPoolError({ partitionKey: wmWorkerPoolError.partition_key, rowKey: wmWorkerPoolError.row_key });
    this.wmWorkerPoolErrors.add(c);

    return c;
  }

  /* fake functions */

  async wm_workers_entities_load(partitionKey, rowKey) {
    const wmWorker = this._getWmWorker({ partitionKey, rowKey });

    return wmWorker ? [wmWorker] : [];
  }

  async wm_workers_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getWmWorker({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const wmWorker = this._addWmWorker({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'wm_workers_entities_create': wmWorker.etag }];
  }

  async wm_workers_entities_remove(partition_key, row_key) {
    const wmWorker = this._getWmWorker({ partitionKey: partition_key, rowKey: row_key });
    this._removeWmWorker({ partitionKey: partition_key, rowKey: row_key });

    return wmWorker ? [{ etag: wmWorker.etag }] : [];
  }

  async wm_workers_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const wmWorker = this._getWmWorker({ partitionKey: partition_key, rowKey: row_key });

    if (!wmWorker) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (wmWorker.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addWmWorker({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async wm_workers_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.wmWorkers);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }

  async wm_worker_pools_entities_load(partitionKey, rowKey) {
    const wmWorkerPool = this._getWmWorkerPool({ partitionKey, rowKey });

    return wmWorkerPool ? [wmWorkerPool] : [];
  }

  async wm_worker_pools_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getWmWorkerPool({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const wmWorkerPool = this._addWmWorkerPool({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'wm_worker_pools_entities_create': wmWorkerPool.etag }];
  }

  async wm_worker_pools_entities_remove(partition_key, row_key) {
    const wmWorkerPool = this._getWmWorkerPool({ partitionKey: partition_key, rowKey: row_key });
    this._removeWmWorkerPool({ partitionKey: partition_key, rowKey: row_key });

    return wmWorkerPool ? [{ etag: wmWorkerPool.etag }] : [];
  }

  async wm_worker_pools_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const wmWorkerPool = this._getWmWorkerPool({ partitionKey: partition_key, rowKey: row_key });

    if (!wmWorkerPool) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (wmWorkerPool.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addWmWorkerPool({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async wm_worker_pools_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.wmWorkerPools);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }

  /* fake functions */

  async wm_worker_pool_errors_entities_load(partitionKey, rowKey) {
    const wmWorkerPoolError = this._getWmWorkerPoolError({ partitionKey, rowKey });

    return wmWorkerPoolError ? [wmWorkerPoolError] : [];
  }

  async wm_worker_pool_errors_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getWmWorkerPoolError({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const wmWorkerPoolError = this._addWmWorkerPoolError({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'wm_worker_pool_errors_entities_create': wmWorkerPoolError.etag }];
  }

  async wm_worker_pool_errors_entities_remove(partition_key, row_key) {
    const wmWorkerPoolError = this._getWmWorkerPoolError({ partitionKey: partition_key, rowKey: row_key });
    this._removeWmWorkerPoolError({ partitionKey: partition_key, rowKey: row_key });

    return wmWorkerPoolError ? [{ etag: wmWorkerPoolError.etag }] : [];
  }

  async wm_worker_pool_errors_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const wmWorkerPoolError = this._getWmWorkerPoolError({ partitionKey: partition_key, rowKey: row_key });

    if (!wmWorkerPoolError) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (wmWorkerPoolError.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addWmWorkerPoolError({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async wm_worker_pool_errors_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.wmWorkerPoolErrors);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }
}

module.exports = FakeWorkerManager;
