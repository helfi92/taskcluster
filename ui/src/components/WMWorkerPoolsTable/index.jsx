import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core';
import Label from '@mozilla-frontend-infra/components/Label';
import { bool, arrayOf, string, func } from 'prop-types';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography/';
import ListItemText from '@material-ui/core/ListItemText';
import IconButton from '@material-ui/core/IconButton';
import LinkIcon from 'mdi-react/LinkIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import WorkerIcon from 'mdi-react/WorkerIcon';
import MessageAlertIcon from 'mdi-react/MessageAlertIcon';
import { withRouter } from 'react-router-dom';
import memoize from 'fast-memoize';
import { isEmpty } from 'ramda';
import { WorkerManagerWorkerPoolSummary } from '../../utils/prop-types';
import DataTable from '../DataTable';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import Button from '../Button';
import TableCellItem from '../TableCellItem';
import ErrorPanel from '../ErrorPanel';
import DialogAction from '../DialogAction';
import formatError from '../../utils/formatError';
import { NULL_PROVIDER } from '../../utils/constants';
import { splitWorkerPoolId } from '../../utils/workerPool';

@withRouter
@withStyles(theme => ({
  button: {
    marginLeft: -theme.spacing.double,
    marginRight: theme.spacing.unit,
    borderRadius: 4,
  },
  linksIcon: {
    marginRight: theme.spacing.unit,
  },
  linksButton: {
    marginRight: theme.spacing.triple,
  },
}))
export default class WorkerManagerWorkerPoolsTable extends Component {
  static propTypes = {
    workerPools: arrayOf(WorkerManagerWorkerPoolSummary).isRequired,
    searchTerm: string,
    deleteRequest: func.isRequired,
    includeDeleted: bool,
  };

  static defaultProps = {
    searchTerm: '',
    includeDeleted: false,
  };

  state = {
    sortBy: 'workerPoolId',
    sortDirection: 'asc',
    error: null,
    actionLoading: false,
    dialogError: null,
    dialogOpen: false,
    workerPool: null,
  };

  sortWorkerPools = memoize(
    (workerPools, sortBy, sortDirection, searchTerm, includeDeleted) => {
      const filteredWorkerPoolsBySearchTerm = searchTerm
        ? workerPools.filter(({ workerPoolId }) =>
            workerPoolId.includes(searchTerm)
          )
        : workerPools;
      const filteredWorkerPools = includeDeleted
        ? filteredWorkerPoolsBySearchTerm
        : filteredWorkerPoolsBySearchTerm.filter(
            ({ providerId }) => providerId !== NULL_PROVIDER
          );

      return isEmpty(filteredWorkerPools)
        ? filteredWorkerPools
        : [...filteredWorkerPools].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortBy] : a[sortBy];
            const secondElement =
              sortDirection === 'desc' ? a[sortBy] : b[sortBy];

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([
        workerPools,
        sortBy,
        sortDirection,
        searchTerm,
        includeDeleted,
      ]) => {
        // we serialize by workerPool ID - for workerpool addition
        // and by providerId - for workerpool deletion
        // (we delete them by changing provider)
        const ids = workerPools
          .map(wp => `${wp.workerPoolId}-${wp.providerId}`)
          .sort();

        return `${ids.join(
          '-'
        )}-${sortBy}-${sortDirection}-${searchTerm}-${includeDeleted}`;
      },
    }
  );

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header.id ? toggled : 'desc';

    this.setState({ sortBy: header.id, sortDirection });
  };

  handleDeleteClick = async () => {
    const { workerPool } = this.state;
    const payload = {
      providerId: workerPool.providerId,
      description: workerPool.description,
      config: workerPool.config,
      owner: workerPool.owner,
      emailOnError: workerPool.emailOnError,
    };

    this.props.history.replace('/worker-manager');

    try {
      await this.props.deleteRequest({
        workerPoolId: workerPool.workerPoolId,
        payload,
      });
      this.setState({
        dialogOpen: false,
        workerPool: null,
      });
    } catch (error) {
      this.setState({
        error: formatError(error),
        actionLoading: false,
        dialogOpen: false,
        workerPool: null,
      });
    }
  };

  handleDialogActionOpen = workerPool => {
    this.setState({
      dialogOpen: true,
      workerPool,
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionComplete = () => {
    this.props.history.push('/worker-manager');
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      dialogError: null,
      workerPool: null,
    });
  };

  renderRow = workerPool => {
    const {
      match: { path },
      classes,
    } = this.props;
    const { actionLoading } = this.state;
    const { handleDialogActionOpen } = this;
    const iconSize = 16;
    const { provisionerId, workerType } = splitWorkerPoolId(
      workerPool.workerPoolId
    );

    return (
      <TableRow key={workerPool.workerPoolId}>
        <TableCell>
          {workerPool.providerId !== NULL_PROVIDER ? (
            <TableCellItem
              button
              component={Link}
              to={`${path}/${encodeURIComponent(workerPool.workerPoolId)}`}>
              <ListItemText
                disableTypography
                primary={<Typography>{workerPool.workerPoolId}</Typography>}
              />
              <LinkIcon size={iconSize} />
            </TableCellItem>
          ) : (
            <Typography>{workerPool.workerPoolId}</Typography>
          )}
        </TableCell>

        <TableCell>
          {workerPool.providerId !== NULL_PROVIDER ? (
            <Typography>{workerPool.providerId}</Typography>
          ) : (
            <em>n/a</em>
          )}
        </TableCell>

        <TableCell>
          <Typography>{workerPool.pendingTasks}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.owner}</Typography>
        </TableCell>

        <TableCell>
          <Button
            className={classes.linksButton}
            variant="outlined"
            component={Link}
            to={`/provisioners/${encodeURIComponent(
              provisionerId
            )}/worker-types/${encodeURIComponent(workerType)}`}
            disabled={actionLoading}
            size="small">
            <WorkerIcon className={classes.linksIcon} size={iconSize} />
            View Workers
          </Button>
          <Button
            className={classes.linksButton}
            variant="outlined"
            component={Link}
            to={`${path}/${encodeURIComponent(workerPool.workerPoolId)}/errors`}
            disabled={actionLoading}
            size="small">
            <MessageAlertIcon className={classes.linksIcon} size={iconSize} />
            View Errors
          </Button>
          {workerPool.providerId !== NULL_PROVIDER ? (
            <IconButton
              title="Delete Worker Pool ID"
              className={classes.button}
              name={`${workerPool.workerPoolId}`}
              onClick={() => handleDialogActionOpen(workerPool)}
              disabled={actionLoading}>
              <DeleteIcon size={iconSize} />
            </IconButton>
          ) : (
            <Label mini status="warning" className={classes.button}>
              Scheduled for deletion
            </Label>
          )}
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const { workerPools, searchTerm, includeDeleted } = this.props;
    const {
      sortBy,
      sortDirection,
      error,
      dialogError,
      dialogOpen,
      workerPool,
    } = this.state;
    const {
      handleDeleteClick,
      handleDialogActionComplete,
      handleDialogActionClose,
      handleDialogActionError,
      handleHeaderClick,
      renderRow,
    } = this;
    const sortedWorkerPools = this.sortWorkerPools(
      workerPools,
      sortBy,
      sortDirection,
      searchTerm,
      includeDeleted
    );
    const headers = [
      { label: 'Worker Pool ID', id: 'workerPoolId', type: 'string' },
      { label: 'Provider ID', id: 'providerId', type: 'string' },
      {
        label: 'Pending Tasks',
        id: 'pendingTasks',
        type: 'number',
      },
      {
        label: 'Owner',
        id: 'owner',
        type: 'string',
      },
      {
        label: '',
        id: '',
        type: 'undefined',
      },
    ];

    return (
      <Fragment>
        {error && <ErrorPanel fixed error={error} />}
        <DataTable
          items={sortedWorkerPools}
          headers={headers}
          sortByLabel={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={handleHeaderClick}
          renderRow={renderRow}
          padding="dense"
        />
        {dialogOpen && (
          <DialogAction
            open={dialogOpen}
            onSubmit={handleDeleteClick}
            onComplete={handleDialogActionComplete}
            onClose={handleDialogActionClose}
            onError={handleDialogActionError}
            error={dialogError}
            title="Delete Worker Pool?"
            body={
              <Typography>
                {`This will delete the worker pool ${workerPool.workerPoolId}.`}
              </Typography>
            }
            confirmText="Delete Worker Pool"
          />
        )}
      </Fragment>
    );
  }
}
