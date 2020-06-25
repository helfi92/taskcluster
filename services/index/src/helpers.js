let assert = require('assert');
const _ = require('lodash');
const { paginateResults } = require('taskcluster-lib-api');
const {UNIQUE_VIOLATION} = require('taskcluster-lib-postgres');

/** Regular expression for valid namespaces */
exports.namespaceFormat = /^([a-zA-Z0-9_!~*'()%-]+\.)*[a-zA-Z0-9_!~*'()%-]+$/;

exports.MAX_MODIFY_ATTEMPTS = 5;

const makeError = (message, code, statusCode) => {
  const err = new Error(message);
  err.code = code;
  err.name = `${code}Error`;
  err.statusCode = statusCode;
  return err;
};

exports.make404 = () => makeError('Resource not found', 'ResourceNotFound', 404);
exports.makeMaxModifyAttempts = () => makeError('MAX_MODIFY_ATTEMPTS exhausted, check for congestion', 'EntityWriteCongestionError', 409);

exports.taskUtils = {
  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.
  fromDbRows(rows) {
    if (rows.length === 1) {
      return exports.taskUtils.fromDb(rows[0]);
    }
  },
  // Create a single instance from a DB row
  fromDb(row) {
    return {
      namespace: row.namespace,
      name: row.name,
      rank: row.rank,
      taskId: row.task_id,
      data: row.data,
      expires: row.expires,
      etag: row.etag,
    };
  },
  // Create a serializable representation of this indexed task suitable for response
  // from an API method.
  serialize(task) {
    let ns = task.namespace + '.' + task.name;
    // Remove separate if there is no need
    if (task.namespace.length === 0 || task.name.length === 0) {
      ns = task.namespace + task.name;
    }

    return {
      namespace: ns,
      taskId: task.taskId,
      rank: task.rank,
      data: _.cloneDeep(task.data),
      expires: task.expires.toJSON(),
    };
  },
  /**
   * Insert task into `namespace` where:
   *
   * input:
   * {
   *   expires:      // Date object
   *   data:         // IndexedTask.data or JSON date string
   *   taskId:       // TaskId for task
   *   rank:         // IndexedTask.rank
   * }
   *
   */
  insertTask(db, namespace, input) {
    // Validate input
    assert(input.expires instanceof Date, 'expires must be a Date object');
    assert(input.data instanceof Object, 'data must be an object');
    assert(input.taskId, 'taskId must be given');
    assert(typeof input.rank === 'number', 'rank must be a number');
    assert(db,
      'db must be set');

    // Get namespace and ensure that we have a least one dot
    namespace = namespace.split('.');

    // Find name and namespace
    let name = namespace.pop() || '';
    namespace = namespace.join('.');

    // Find expiration time and parse as date object
    let expires = new Date(input.expires);

    // Attempt to load indexed task
    return db.fns.get_indexed_task(namespace, name)
      .then(async function(t) {
        const task = exports.taskUtils.fromDbRows(t);

        // Update if we prefer input over what we have
        if (task.rank <= input.rank) {
          const updatedTask = await db.fns.update_indexed_task(
            task.namespace,
            task.name,
            input.rank,
            input.taskId,
            input.data,
            expires,
            task.etag,
          );

          await exports.namespaceUtils.ensureNamespace(db, namespace, expires);

          return exports.taskUtils.fromDbRows(updatedTask);
        } else {
          return task;
        }
      }, function(err) {
        // Re-throw error, if it's not a 404
        if (err.code !== 'P0002') {
          throw err;
        }

        // Create namespace hierarchy
        return exports.namespaceUtils.ensureNamespace(
          db,
          namespace,
          expires,
        ).then(async function() {
          const etag = (await db.fns.create_indexed_task(
            namespace,
            name,
            input.rank,
            input.taskId,
            input.data,
            expires,
          ))[0].create_indexed_task;

          return {
            namespace,
            name,
            rank: input.rank,
            taskId: input.taskId,
            data: input.data,
            expires,
            etag,
          };
        });
      });
  },
  // Call db.get_indexed_tasks with named arguments.
  // You can use this in two ways: with a handler or without a handler.
  // In the latter case you'll get a list of up to 1000 entries and a
  // continuation token.
  // The response will be of the form { rows, continationToken }.
  // If there are no indexed tasks to show, the response will have the
  // `rows` field set to an empty array.
  //
  // If a handler is supplied, then it will invoke the handler
  // on every item of the scan.
  async getIndexedTasks(
    db,
    { namespace, name },
    {
      query,
      handler,
    } = {},
  ) {
    assert(!handler || handler instanceof Function,
      'If options.handler is given it must be a function');
    const fetchResults = async (continuation) => {
      let q = query;

      if (continuation) {
        q.continuationToken = continuation;
      }

      const {continuationToken, rows} = await paginateResults({
        query: q,
        fetch: (size, offset) => db.fns.get_indexed_tasks(
          namespace || namespace === '' ? namespace : null,
          name || name === '' ? name : null,
          size,
          offset,
        ),
      });

      const entries = rows.map(exports.taskUtils.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    let results = await fetchResults(query ? query.continuationToken : {});

    // If we have a handler, then we have to handle the results
    if (handler) {
      const handleResults = async (res) => {
        await Promise.all(res.rows.map((item) => handler.call(this, item)));

        if (res.continuationToken) {
          return await handleResults(await fetchResults(res.continuationToken));
        }
      };
      results = await handleResults(results);
    }
    return results;
  },
};

exports.namespaceUtils = {
  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.
  fromDbRows(rows) {
    if (rows.length === 1) {
      return exports.namespaceUtils.fromDb(rows[0]);
    }
  },
  // Create a single instance from a DB row
  fromDb(row) {
    return {
      parent: row.parent,
      name: row.name,
      expires: row.expires,
      etag: row.etag,
    };
  },
  // Create a serializable representation of this namespace suitable for response
  // from an API method.
  serialize(indexNamespace) {
    let ns = indexNamespace.parent + '.' + indexNamespace.name;
    // Remove separate if there is no need
    if (indexNamespace.parent.length === 0 || indexNamespace.name.length === 0) {
      ns = indexNamespace.parent + indexNamespace.name;
    }
    return {
      namespace: ns,
      name: indexNamespace.name,
      expires: indexNamespace.expires.toJSON(),
    };
  },
  // Call db.get_index_namespaces with named arguments.
  // You can use this in two ways: with a handler or without a handler.
  // In the latter case you'll get a list of up to 1000 entries and a
  // continuation token.
  // The response will be of the form { rows, continationToken }.
  // If there are no namespaces to show, the response will have the
  // `rows` field set to an empty array.
  //
  // If a handler is supplied, then it will invoke the handler
  // on every item of the scan.
  async getNamespaces(
    db,
    { parent, name },
    {
      query,
      handler,
    } = {},
  ) {
    assert(!handler || handler instanceof Function,
      'If options.handler is given it must be a function');
    const fetchResults = async (continuation) => {
      let q = query;

      if (continuation) {
        q.continuationToken = continuation;
      }

      const {continuationToken, rows} = await paginateResults({
        query: q,
        fetch: (size, offset) => db.fns.get_index_namespaces(
          parent || parent === '' ? parent : null,
          name || name === '' ? name : null,
          size,
          offset,
        ),
      });

      const entries = rows.map(exports.namespaceUtils.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    let results = await fetchResults(query ? query.continuationToken : {});

    // If we have a handler, then we have to handle the results
    if (handler) {
      const handleResults = async (res) => {
        await Promise.all(res.rows.map((item) => handler.call(this, item)));

        if (res.continuationToken) {
          return await handleResults(await fetchResults(res.continuationToken));
        }
      };
      results = await handleResults(results);
    }
    return results;
  },
  /** Create parent structure */
  ensureNamespace(db, namespace, expires) {
    // Stop recursion at root
    if (namespace.length === 0) {
      return Promise.resolve(null);
    }

    // Round to date to avoid updating all the time
    expires = new Date(
      expires.getFullYear(),
      expires.getMonth(),
      expires.getDate() + 1,
      0, 0, 0, 0,
    );

    // Parse namespace
    if (!(namespace instanceof Array)) {
      namespace = namespace.split('.');
    }
    // Find parent and folder name
    let name = namespace.pop() || '';
    let parent = namespace.join('.');

    // Load namespace, to check if it exists and if we should update expires
    return db.fns.get_index_namespace(parent, name)
      .then(async function(f) {
        const folder = exports.taskUtils.fromDbRows(f);
        // Modify the namespace
        if (folder.expires < expires) {
          // Update expires
          const updatedNamespace = await db.fns.update_index_namespace(parent, name, expires);
          // Update all parents first though
          await exports.namespaceUtils.ensureNamespace(db, namespace, expires);

          return exports.taskUtils.fromDbRows(updatedNamespace);
        }

        return folder;
      }, function(err) {
        // Re-throw exception, if it's not because the namespace is missing
        if (!err || err.code !== 'P0002') {
          throw err;
        }

        // Create parent namespaces
        return exports.namespaceUtils.ensureNamespace(
          db,
          namespace,
          expires,
        ).then(async function() {
          // Create namespace
          return db.fns.create_index_namespace(parent, name, expires).then(null, async function(err) {
            // Re-throw error if it's not because the entity was constructed while we
            // waited
            if (!err || err.code !== UNIQUE_VIOLATION) {
              throw err;
            }

            const namespace = await db.fns.get_index_namespace(parent, name);

            return exports.namespaceUtils.fromDbRows(namespace);
          });
        });
      });
  },
};
