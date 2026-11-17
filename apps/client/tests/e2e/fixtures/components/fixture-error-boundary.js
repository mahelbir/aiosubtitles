'use client';

import {Component} from 'react';
import {ErrorAlert} from '@/components/common/status-alerts';

export class FixtureErrorBoundary extends Component {
  state = {error: null};

  static getDerivedStateFromError(error) {
    return {error};
  }

  render() {
    if (this.state.error) {
      return <ErrorAlert>{this.state.error.message}</ErrorAlert>;
    }
    return this.props.children;
  }
}
