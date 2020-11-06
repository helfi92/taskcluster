const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withBackends(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.apiClient.ping();
  });

  test('should be able to upload', async function() {
    await helper.apiClient.uploadObject('public/foo', 'x');
    const rows = await helper.db.fns.get_object('public/foo');

    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'public/foo');
    assert.deepEqual(rows[0].data, { backendId: 'pub', projectId: 'x', name: 'public/foo' });
  });
});
