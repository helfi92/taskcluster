const taskcluster = require('taskcluster-client');
const { fakeauth, stickyLoader, Secrets, withMonitor } = require('taskcluster-lib-testing');
const load = require('../src/main');
const builder = require('../src/api.js');
const { withDb } = require('taskcluster-lib-testing');
const { BACKEND_TYPES } = require('../src/backends');
const { TestBackend } = require('../src/backends/test');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secrets: { },
  load: exports.load,
});

exports.rootUrl = 'http://localhost:60401';
const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

exports.withBackends = (mock, skipping) => {
  suiteSetup('withBackends', async function() {
    if (skipping()) {
      return;
    }

    // add the 'test' backend only for testing
    BACKEND_TYPES['test'] = TestBackend;

    await exports.load('cfg');
    exports.load.cfg('backends', {
      pub: { backendType: 'test' },
    });
    exports.load.cfg('backendMap', [
      // not anchored, so can appear anywhere in the name
      { backendId: 'pub', when: { name: { regexp: 'public/.*' } } },
      // anchored to the beginning of the string
      { backendId: 'pub', when: { name: { regexp: '^pubdocs/.*' } } },
    ]);
  });

  suiteTeardown('withBackends', async function() {
    delete BACKEND_TYPES['test'];
  });
};

exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup('withServer', async function() {
    if (skipping()) {
      return;
    }
    await exports.load('cfg');
    exports.load.cfg('server.port', 60401);
    exports.load.cfg('server.env', 'development');
    exports.load.cfg('server.forceSSL', false);
    exports.load.cfg('server.trustProxy', true);

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);
    fakeauth.start(testclients, { rootUrl: exports.rootUrl });

    exports.ObjectClient = taskcluster.createClient(builder.reference());

    exports.apiClient = new exports.ObjectClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      retries: 0,
      rootUrl: exports.rootUrl,
    });

    webServer = await exports.load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    fakeauth.stop();
  });
};

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'object');
};
