import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import classNames from 'classnames';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Divider from '@material-ui/core/Divider';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import ConsoleIcon from 'mdi-react/ConsoleIcon';
import MonitorIcon from 'mdi-react/MonitorIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Markdown from '../../../components/Markdown';
import StatusLabel from '../../../components/StatusLabel';
import ErrorPanel from '../../../components/ErrorPanel';
import { withAuth } from '../../../utils/Auth';
import notify from '../../../utils/notify';
import taskQuery from './task.graphql';
import {
  INITIAL_CURSOR,
  INTERACTIVE_TASK_STATUS,
  TASK_STATE,
  INTERACTIVE_CONNECT_TASK_POLL_INTERVAL,
} from '../../../utils/constants';

const NOTIFY_KEY = 'interactive-notify';
let previousCursor;

@hot(module)
@withAuth
@graphql(taskQuery, {
  options: props => ({
    errorPolicy: 'all',
    pollInterval: INTERACTIVE_CONNECT_TASK_POLL_INTERVAL,
    variables: {
      taskId: props.match.params.taskId,
    },
  }),
})
@withStyles(theme => ({
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  divider: {
    margin: `${theme.spacing.double}px 0`,
  },
  warningPanel: {
    marginTop: theme.spacing.double,
    marginBottom: theme.spacing.double,
    ...theme.mixins.warningPanel,
  },
  viewTaskDetails: {
    marginTop: theme.spacing.double,
  },
}))
export default class InteractiveConnect extends Component {
  static getDerivedStateFromProps(
    props,
    { displayUrl, shellUrl, artifactsLoading, previousTaskId }
  ) {
    const {
      data: { task, error },
      match: {
        params: { taskId },
      },
    } = props;

    if (error) {
      return {
        artifactsLoading: false,
      };
    }

    // Reset state when Task ID changes
    if (previousTaskId !== taskId) {
      return {
        displayUrl: null,
        shellUrl: null,
        artifactsLoading: true,
        previousTaskId: taskId,
      };
    }

    // Get connection URL
    if ((!shellUrl || !displayUrl) && task && task.latestArtifacts) {
      const artifacts = task.latestArtifacts.edges;
      const urls = artifacts.reduce((acc, { node: { name, url } }) => {
        if (name.endsWith('shell.html')) {
          return {
            ...acc,
            shellUrl: url,
          };
        }

        if (name.endsWith('display.html')) {
          return {
            ...acc,
            displayUrl: url,
          };
        }

        return acc;
      }, {});

      return {
        ...urls,
        ...(artifactsLoading && !task.latestArtifacts.pageInfo.hasNextPage
          ? { artifactsLoading: false }
          : null),
        previousTaskId: taskId,
      };
    }

    return null;
  }

  constructor(props) {
    super(props);

    previousCursor = INITIAL_CURSOR;
    this.hasNotified = false;
  }

  state = {
    displayUrl: null,
    shellUrl: null,
    artifactsLoading: true,
    // eslint-disable-next-line react/no-unused-state
    previousTaskId: this.props.match.params.taskId,
    notifyOnReady:
      'Notification' in window && localStorage.getItem(NOTIFY_KEY) === 'true',
  };

  componentDidUpdate(prevProps) {
    const {
      data: { task, fetchMore, refetch },
      match: {
        params: { taskId },
      },
    } = this.props;
    const { notifyOnReady } = this.state;

    if (
      this.getInteractiveStatus() === INTERACTIVE_TASK_STATUS.READY &&
      !this.hasNotified &&
      notifyOnReady
    ) {
      notify({
        body: 'Interactive task is ready for connecting',
      });

      this.hasNotified = true;
    }

    if (prevProps.match.params.taskId !== taskId) {
      previousCursor = INITIAL_CURSOR;

      return refetch({
        pollInterval: INTERACTIVE_CONNECT_TASK_POLL_INTERVAL,
        variables: {
          taskId: this.props.match.params.taskId,
        },
      });
    }

    // We're done fetching
    if (
      !task ||
      !task.latestArtifacts ||
      !task.latestArtifacts.pageInfo.hasNextPage
    ) {
      previousCursor = INITIAL_CURSOR;

      return;
    }

    if (
      task.latestArtifacts &&
      previousCursor === task.latestArtifacts.pageInfo.cursor
    ) {
      fetchMore({
        variables: {
          taskId,
          artifactsConnection: {
            cursor: task.latestArtifacts.pageInfo.nextCursor,
            previousCursor: task.latestArtifacts.pageInfo.cursor,
          },
        },
        updateQuery(previousResult, { fetchMoreResult, variables }) {
          if (variables.artifactsConnection.previousCursor === previousCursor) {
            const { edges, pageInfo } = fetchMoreResult.task.latestArtifacts;

            previousCursor = variables.artifactsConnection.cursor;

            if (!edges.length) {
              return previousResult;
            }

            const result = dotProp.set(
              previousResult,
              'task.latestArtifacts',
              latestArtifacts =>
                dotProp.set(
                  dotProp.set(
                    latestArtifacts,
                    'edges',
                    previousResult.task.latestArtifacts.edges.concat(edges)
                  ),
                  'pageInfo',
                  pageInfo
                )
            );

            return result;
          }
        },
      });
    }
  }

  getInteractiveStatus = () => {
    const { shellUrl, displayUrl } = this.state;
    const { status } = this.props.data.task;

    if (!shellUrl || !displayUrl) {
      return INTERACTIVE_TASK_STATUS.WAITING;
    }

    if (
      [TASK_STATE.COMPLETED, TASK_STATE.FAILED, TASK_STATE.EXCEPTION].includes(
        status.state
      )
    ) {
      return INTERACTIVE_TASK_STATUS.RESOLVED;
    }

    return INTERACTIVE_TASK_STATUS.READY;
  };

  handleDisplayOpen = () => {
    window.open(this.state.displayUrl, '_blank');
  };

  handleShellOpen = () => {
    window.open(this.state.shellUrl, '_blank');
  };

  handleTaskIdSearchSubmit = taskId => {
    if (taskId && this.props.match.params.taskId !== taskId) {
      this.props.history.push(`/tasks/${taskId}/connect`);
    }
  };

  handleNotificationChange = async ({ target: { checked } }) => {
    if (Notification.permission === 'granted') {
      localStorage.setItem(NOTIFY_KEY, checked);

      return this.setState({ notifyOnReady: checked });
    }

    // The user is requesting to be notified, but has not yet granted permission
    const permission = await Notification.requestPermission();
    const notifyOnReady = permission === 'granted';

    localStorage.setItem(NOTIFY_KEY, notifyOnReady);
    this.setState({ notifyOnReady });
  };

  renderTask = () => {
    const {
      classes,
      data: { task },
      match: {
        params: { taskId },
      },
      user,
    } = this.props;
    const { notifyOnReady } = this.state;
    const interactiveStatus = this.getInteractiveStatus();
    const isSessionReady = interactiveStatus === INTERACTIVE_TASK_STATUS.READY;
    const isSessionResolved =
      interactiveStatus === INTERACTIVE_TASK_STATUS.RESOLVED;

    return (
      <Fragment>
        {isSessionReady && (
          <ErrorPanel
            className={classes.warningPanel}
            warning
            error="This is not a development environment. Interactive
              tasks can help debug issues, but note that these workers may be spot
              nodes that can be terminated at any time."
          />
        )}
        {isSessionResolved && (
          <ErrorPanel
            warning
            error="You can not attach to an interactive task after it has stopped
          running."
            className={classes.warningPanel}
          />
        )}
        <List>
          <ListItem>
            <ListItemText primary="Name" secondary={task.metadata.name} />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Description"
              secondary={<Markdown>{task.metadata.description}</Markdown>}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="State"
              secondary={<StatusLabel state={task.status.state} />}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Interactive Status"
              secondary={<StatusLabel state={interactiveStatus} />}
            />
          </ListItem>
          <ListItem>
            <FormControlLabel
              control={
                <Switch
                  disabled={
                    !('Notification' in window) ||
                    Notification.permission === 'denied'
                  }
                  checked={notifyOnReady}
                  onChange={this.handleNotificationChange}
                  color="secondary"
                />
              }
              label="Notify Me on Ready"
            />
          </ListItem>
          <ListItem
            button
            className={classNames(
              classes.listItemButton,
              classes.viewTaskDetails
            )}
            component={Link}
            to={`/tasks/${taskId}`}>
            <ListItemText primary="View task details" />
            <LinkIcon />
          </ListItem>
        </List>
        {isSessionReady && (
          <Fragment>
            <Divider className={classes.divider} />
            <Typography variant="h5">Select a Session</Typography>
            <Typography>
              You have approximately <strong>5 minutes</strong> to connect,
              after that the task will shutdown when all connections are closed.
            </Typography>
            <List>
              <ListItem
                disabled={!user}
                button
                onClick={this.handleShellOpen}
                className={classes.listItemButton}>
                <ConsoleIcon />
                <ListItemText primary="Shell" />
                <OpenInNewIcon />
              </ListItem>
              <ListItem
                disabled={!user}
                onClick={this.handleDisplayOpen}
                button
                className={classes.listItemButton}>
                <MonitorIcon />
                <ListItemText primary="Display" />
                <OpenInNewIcon />
              </ListItem>
            </List>
          </Fragment>
        )}
      </Fragment>
    );
  };

  render() {
    const {
      data: { task, error },
    } = this.props;
    const { artifactsLoading } = this.state;

    return (
      <Dashboard
        title="Interactive Connect"
        search={<Search onSubmit={this.handleTaskIdSearchSubmit} />}>
        <Fragment>
          {!error && artifactsLoading && <Spinner loading />}
          <ErrorPanel error={error} />
          {!artifactsLoading && task && this.renderTask()}
        </Fragment>
      </Dashboard>
    );
  }
}
