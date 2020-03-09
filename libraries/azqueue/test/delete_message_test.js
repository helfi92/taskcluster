const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const AZQueue = require('taskcluster-lib-azqueue');
const path = require('path');
const assert = require('assert').strict;
const _ = require('lodash');

helper.dbSuite(path.basename(__filename), function() {
  const schema = Schema.fromDbDirectory(path.join(__dirname, 'db'));
  const serviceName = 'test-azqueue';
  helper.withDb({ schema, serviceName, clearBeforeTests: true });

  test('delete message after getting', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 100 });
    const result1 = await queue.getMessages('foo', {visibilityTimeout: 0, numberOfMessages: 2});
    assert.deepEqual(result1.map(({messageText}) => messageText), ['bar-1']);

    await queue.deleteMessage('foo', result1[0].messageId, result1[0].popReceipt);

    // visibility timeout was 0, so if this is still in the queue, it should be gettable
    const result2 = await queue.getMessages('foo', {visibilityTimeout: 0, numberOfMessages: 2});
    assert.deepEqual(result2, []);
  });
});
