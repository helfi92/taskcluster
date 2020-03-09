const assert = require('assert');
const slugid = require('slugid');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { getEntries } = require('../utils');

class FakeSecrets {
  constructor() {
    this.secrets = new Set();
  }

  /* helpers */

  reset() {
    this.secrets = new Set();
  }

  _getSecret_({ partitionKey, rowKey }) {
    for (let c of [...this.secrets]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeSecret_({ partitionKey, rowKey }) {
    for (let c of [...this.secrets]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.secrets.delete(c);
        break;
      }
    }
  }

  _addSecret_(secret) {
    assert(typeof secret.partition_key === "string");
    assert(typeof secret.row_key === "string");
    assert(typeof secret.value === "object");
    assert(typeof secret.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: secret.partition_key,
      row_key_out: secret.row_key,
      value: secret.value,
      version: secret.version,
      etag,
    };

    this._removeSecret_({ partitionKey: secret.partition_key, rowKey: secret.row_key });
    this.secrets.add(c);

    return c;
  }

  /* fake functions */

  async secrets_entities_load(partitionKey, rowKey) {
    const secret = this._getSecret_({ partitionKey, rowKey });

    return secret ? [secret] : [];
  }

  async secrets_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getSecret_({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const secret = this._addSecret_({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ 'secrets_entities_create': secret.etag }];
  }

  async secrets_entities_remove(partition_key, row_key) {
    const secret = this._getSecret_({ partitionKey: partition_key, rowKey: row_key });
    this._removeSecret_({ partitionKey: partition_key, rowKey: row_key });

    return secret ? [{ etag: secret.etag }] : [];
  }

  async secrets_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const secret = this._getSecret_({ partitionKey: partition_key, rowKey: row_key });

    if (!secret) {
      const err = new Error('no such row');
      err.code = 'P0002';
      throw err;
    }

    if (secret.etag !== oldEtag) {
      const err = new Error('unsuccessful update');
      err.code = 'P0004';
      throw err;
    }

    const c = this._addSecret_({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async secrets_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.secrets);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }
}

module.exports = FakeSecrets;
