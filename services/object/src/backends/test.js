const { Backend } = require('./base');

/**
 * The test backend type is only available when running tests.
 */
class TestBackend extends Backend {
  objectRetrievalDetails(name, acceptProtocol) {
    return {
      protocol: 'HTTP:GET',
      details: {
        url: 'https://google.ca',
      },
    };
  }

  async expireObject(object) {
    switch (object.data.expirationReturns) {
      case 'fail': throw new Error('uhoh');
      case false: return false;
      case true: return true;
      default: return true;
    }
  }
}

module.exports = { TestBackend };
