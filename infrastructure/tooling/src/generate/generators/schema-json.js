const { Schema } = require('taskcluster-lib-postgres');

// Generate a readable JSON version of the schema.
exports.tasks = [{
  title: 'Schema JSON',
  requires: [],
  provides: ['schema-json'],
  run: async (requirements, utils) => {
    // 
    const refs = References.fromSerializable({serializable: requirements['references-json']});

    const apis = {};
    refs.references.forEach(({filename, content}) => {
      const refSchema = refs.getSchema(content.$schema);

      if (refSchema.metadata.name !== 'api' && refSchema.metadata.name !== 'exchanges') {
        return; // ignore this reference
      }
      if (refSchema.metadata.version !== 0) {
        throw new Error(`Unknown reference version in ${filename}`);
      }

      // invent a CamelCase name
      const camelCaseName = content.serviceName
        .split('-')
        .concat(refSchema.metadata.name === 'exchanges' ? ['events'] : [])
        .map(w => `${w[0].toUpperCase()}${w.slice(1)}`)
        .join('');
      apis[camelCaseName] = {reference: content};
    });

    return {apis};
  },
}];