import React, { Component } from 'react';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import { MuiThemeProvider } from '@material-ui/core/styles';
import theme from '../theme';

export default class ThemeWrapper extends Component {
  state = {
    error: null,
  };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    // eslint-disable-next-line no-console
    console.log('ThemeWrapper error: ', this.state.error);

    return (
      <MuiThemeProvider theme={theme.darkTheme}>
        {this.state.error ? (
          <ErrorPanel fixed error={this.state.error} />
        ) : (
          this.props.children
        )}
      </MuiThemeProvider>
    );
  }
}
