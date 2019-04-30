import assert from 'assert';
import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import loader from 'taskcluster-lib-loader';
import docs from 'taskcluster-lib-docs';
import config from 'taskcluster-lib-config';
import { createServer } from 'http';
import { Client, pulseCredentials } from 'taskcluster-lib-pulse';
import { ApolloServer } from 'apollo-server-express';
import monitorManager from './monitor';
import createApp from './servers/createApp';
import formatError from './servers/formatError';
import createContext from './createContext';
import createSchema from './createSchema';
import createSubscriptionServer from './servers/createSubscriptionServer';
import resolvers from './resolvers';
import typeDefs from './graphql';
import PulseEngine from './PulseEngine';
import scanner from './login/scanner';

const load = loader(
  {
    cfg: {
      requires: ['profile'],
      setup: ({ profile }) => config({ profile }),
    },

    monitor: {
      requires: ['cfg', 'profile', 'process'],
      setup: ({ cfg, profile, process }) =>
        monitorManager.setup({
          processName: process,
          verify: profile !== 'production',
          ...cfg.monitoring,
        }),
    },

    docs: {
      requires: ['cfg'],
      setup: ({cfg, schemaset}) => docs.documenter({
        credentials: cfg.taskcluster.credentials,
        rootUrl: cfg.taskcluster.rootUrl,
        projectName: 'taskcluster-web-server',
        tier: 'platform',
        schemaset,
        publish: false,
        references: [{
          name: 'logs',
          reference: monitorManager.reference(),
        }],
      }),
    },

    writeDocs: {
      requires: ['docs'],
      setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
    },

    pulseClient: {
      requires: ['cfg', 'monitor'],
      setup: ({ cfg, monitor }) => {
        if (!cfg.pulse.namespace) {
          assert(
            process.env.NODE_ENV !== 'production',
            'cfg.pulse.namespace is required'
          );
          // eslint-disable-next-line no-console
          console.log(
            `\n\nNo Pulse namespace defined; no Pulse messages will be received.`
          );

          return null;
        }

        return new Client({
          monitor: monitor.monitor('pulse-client'),
          namespace: cfg.pulse.namespace,
          credentials: pulseCredentials(cfg.pulse),
        });
      },
    },

    pulseEngine: {
      requires: ['pulseClient', 'monitor'],
      setup: ({ pulseClient, monitor }) =>
        new PulseEngine({
          pulseClient,
          monitor: monitor.monitor('pulse-engine'),
        }),
    },

    schema: {
      requires: [],
      setup: () =>
        createSchema({
          typeDefs,
          resolvers,
          resolverValidationOptions: {
            requireResolversForResolveType: false,
          },
          validationRules: [depthLimit(10), createComplexityLimitRule(1000)],
        }),
    },

    context: {
      requires: ['cfg', 'pulseEngine', 'strategies'],
      setup: ({ cfg, pulseEngine, strategies }) =>
        createContext({
          pulseEngine,
          rootUrl: cfg.taskcluster.rootUrl,
          strategies,
          cfg,
        }),
    },

    app: {
      requires: ['cfg', 'strategies'],
      setup: ({ cfg, strategies }) => createApp({ cfg, strategies }),
    },

    server: {
      requires: ['app', 'schema', 'context'],
      setup: ({ app, schema, context }) => {
        const server = new ApolloServer({
          schema,
          context,
          formatError,
          tracing: true,
        });
        const httpServer = createServer(app);

        server.applyMiddleware({ app });

        createSubscriptionServer({
          server: httpServer, // this attaches itself directly to the server
          schema,
          context,
          path: '/subscription',
        });

        return httpServer;
      },
    },

    // Login strategies
    strategies: {
      requires: ['cfg'],
      setup: ({ cfg }) => {
        const strategies = {};

        Object.keys(cfg.login.strategies).forEach((name) => {
          const hasConfigValues = Object.values(cfg.login.strategies[name]).filter(Boolean).length !== 0;

          if (hasConfigValues) {
            const Strategy = require('./login/strategies/' + name);
            strategies[name] = new Strategy({ name, cfg });
          }
        });

        return strategies;
      },
    },

    scanner: {
      requires: ['cfg', 'strategies', 'monitor'],
      setup: async ({ cfg, strategies, monitor }) => {
        return monitor.monitor().oneShot('scanner', () => scanner(cfg, strategies));
      },
    },

    devServer: {
      requires: ['cfg', 'server'],
      setup: async ({ cfg, server }) => {
        // apply some sanity-checks
        assert(cfg.server.port, 'config server.port is required');
        assert(
          cfg.taskcluster.rootUrl,
          'config taskcluster.rootUrl is required'
        );

        await new Promise(resolve => server.listen(cfg.server.port, resolve));

        /* eslint-disable no-console */
        console.log(`\n\nWeb server running on port ${cfg.server.port}.`);
        if (cfg.app.playground) {
          console.log(
            `\nOpen the interactive GraphQL Playground and schema explorer in your browser at:
          http://localhost:${cfg.server.port}/playground\n`
          );
        }
        /* eslint-enable no-console */
      },
    },
  },
  {
    // default to 'devServer' since webpack does not pass any command-line args
    // when running in development mode
    profile: process.env.NODE_ENV || 'development',
    process: process.argv[2] || 'devServer',
  }
);

if (!module.parent) {
  load.crashOnError(process.argv[2] || 'devServer');
}
