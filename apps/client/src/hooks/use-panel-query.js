'use client';

import {useCallback, useMemo} from 'react';
import {parseAsString, parseAsStringLiteral, useQueryStates} from 'nuqs';

export const PanelAction = {CREATE: 'create', EDIT: 'edit'};
const PANEL_ACTIONS = [PanelAction.CREATE, PanelAction.EDIT];

export function usePanelQuery({
  actions = PANEL_ACTIONS,
  actionKey = 'action',
  idKey = 'id',
  anchorKey = 'anchor',
} = {}) {
  const parsers = useMemo(
    () => ({
      [actionKey]: parseAsStringLiteral(actions),
      [idKey]: parseAsString,
      [anchorKey]: parseAsString,
    }),
    [actions, actionKey, idKey, anchorKey],
  );
  const [state, setState] = useQueryStates(parsers);
  const action = state[actionKey];
  const id = state[idKey];
  const anchor = state[anchorKey];

  const openAction = useCallback(
    (nextAction, targetId = null) =>
      setState({
        [actionKey]: nextAction,
        [idKey]: targetId ? String(targetId) : null,
        [anchorKey]: null,
      }),
    [setState, actionKey, idKey, anchorKey],
  );
  const open = useCallback(
    (targetId = null) =>
      openAction(targetId ? PanelAction.EDIT : PanelAction.CREATE, targetId),
    [openAction],
  );
  const openNear = useCallback(
    anchorId =>
      setState({
        [actionKey]: PanelAction.CREATE,
        [idKey]: null,
        [anchorKey]: anchorId ?? null,
      }),
    [setState, actionKey, idKey, anchorKey],
  );
  const close = useCallback(
    () => setState({[actionKey]: null, [idKey]: null, [anchorKey]: null}),
    [setState, actionKey, idKey, anchorKey],
  );

  return useMemo(
    () => ({
      action,
      isOpen: action !== null,
      targetId: id || null,
      anchorId: anchor || null,
      open,
      openNear,
      openAction,
      close,
    }),
    [action, id, anchor, open, openNear, openAction, close],
  );
}
