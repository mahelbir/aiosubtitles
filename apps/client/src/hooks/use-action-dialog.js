'use client';

import {useState} from 'react';

export function useActionDialog() {
  const [state, setState] = useState({
    action: null,
    targetIds: [],
    onDone: null,
  });
  // Closing keeps the targets, so a dialog's exit animation never renders empty.
  const close = () => setState(previous => ({...previous, action: null}));

  return {
    open: (action, targetIds, onDone = null) =>
      setState({action, targetIds, onDone}),
    close,
    getDialogProps: action => ({
      open: state.action === action,
      targetIds: state.targetIds,
      onClose: close,
      onDone: () => {
        state.onDone?.();
        close();
      },
    }),
  };
}
