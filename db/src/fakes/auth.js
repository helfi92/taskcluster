const assert = require("assert");
const slugid = require("slugid");
const { UNIQUE_VIOLATION } = require("taskcluster-lib-postgres");
const { getEntries } = require("../utils");

class FakeAuth {
  constructor() {
    this.clients = new Set();
    this.roles = new Set();
  }

  /* helpers */

  reset() {
    this.clients = new Set();
    this.roles = new Set();
  }

  _getClient({ partitionKey, rowKey }) {
    for (let c of [...this.clients]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeClient({ partitionKey, rowKey }) {
    for (let c of [...this.clients]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.clients.delete(c);
        break;
      }
    }
  }

  _addClient(client) {
    assert(typeof client.partition_key === "string");
    assert(typeof client.row_key === "string");
    assert(typeof client.value === "object");
    assert(typeof client.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: client.partition_key,
      row_key_out: client.row_key,
      value: client.value,
      version: client.version,
      etag,
    };

    this._removeClient({ partitionKey: client.partition_key, rowKey: client.row_key });
    this.clients.add(c);

    return c;
  }

  _getRole({ partitionKey, rowKey }) {
    for (let c of [...this.roles]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        return c;
      }
    }
  }

  _removeRole({ partitionKey, rowKey }) {
    for (let c of [...this.roles]) {
      if (c.partition_key_out === partitionKey && c.row_key_out === rowKey) {
        this.roles.delete(c);
        break;
      }
    }
  }

  _addRole(role) {
    assert(typeof role.partition_key === "string");
    assert(typeof role.row_key === "string");
    assert(typeof role.value === "object");
    assert(typeof role.version === "number");

    const etag = slugid.v4();
    const c = {
      partition_key_out: role.partition_key,
      row_key_out: role.row_key,
      value: role.value,
      version: role.version,
      etag,
    };

    this._removeRole({ partitionKey: role.partition_key, rowKey: role.row_key });
    this.roles.add(c);

    return c;
  }

  /* fake functions */

  async clients_entities_load(partitionKey, rowKey) {
    const client = this._getClient({ partitionKey, rowKey });

    return client ? [client] : [];
  }

  async clients_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getClient({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const client = this._addClient({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "clients_entities_create": client.etag }];
  }

  async clients_entities_remove(partition_key, row_key) {
    const client = this._getClient({ partitionKey: partition_key, rowKey: row_key });
    this._removeClient({ partitionKey: partition_key, rowKey: row_key });

    return client ? [{ etag: client.etag }] : [];
  }

  async clients_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const client = this._getClient({ partitionKey: partition_key, rowKey: row_key });

    if (!client) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (client.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addClient({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async clients_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.clients);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }

  async roles_entities_load(partitionKey, rowKey) {
    const role = this._getRole({ partitionKey, rowKey });

    return role ? [role] : [];
  }

  async roles_entities_create(partition_key, row_key, value, overwrite, version) {
    if (!overwrite && this._getRole({ partitionKey: partition_key, rowKey: row_key })) {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = UNIQUE_VIOLATION;
      throw err;
    }

    const role = this._addRole({
      partition_key,
      row_key,
      value,
      version,
    });

    return [{ "roles_entities_create": role.etag }];
  }

  async roles_entities_remove(partition_key, row_key) {
    const role = this._getRole({ partitionKey: partition_key, rowKey: row_key });
    this._removeRole({ partitionKey: partition_key, rowKey: row_key });

    return role ? [{ etag: role.etag }] : [];
  }

  async roles_entities_modify(partition_key, row_key, value, version, oldEtag) {
    const role = this._getRole({ partitionKey: partition_key, rowKey: row_key });

    if (!role) {
      const err = new Error("no such row");
      err.code = "P0002";
      throw err;
    }

    if (role.etag !== oldEtag) {
      const err = new Error("unsuccessful update");
      err.code = "P0004";
      throw err;
    }

    const c = this._addRole({ partition_key, row_key, value, version });
    return [{ etag: c.etag }];
  }

  async roles_entities_scan(partition_key, row_key, condition, size, page) {
    const entries = getEntries({ partitionKey: partition_key, rowKey: row_key, condition }, this.roles);

    return entries.slice((page - 1) * size, (page - 1) * size + size);
  }
}

module.exports = FakeAuth;
