'use client';

import {useEffect, useRef, useState} from 'react';
import {useLatest} from '@reactuses/core';
import {toast} from 'react-toastify';
import {io} from 'socket.io-client';
import {API_ORIGIN, API_SOCKET_PATH} from '@/config/app';
import {ensureFreshToken} from '@/lib/api-client';
import {hasBlockingError} from '@/lib/query';
import {useBusy} from '@/hooks/use-busy';
import {useRemoteSocket} from '../api';

const CONNECTION_TOAST_ID = 'monitor-connection';

const SOCKET_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,
  timeout: 20000,
};

function showConnectionToast(type, message) {
  if (toast.isActive(CONNECTION_TOAST_ID)) {
    toast.update(CONNECTION_TOAST_ID, {
      render: message,
      type,
      autoClose: false,
    });
    return;
  }
  toast[type](message, {toastId: CONNECTION_TOAST_ID, autoClose: false});
}
const FAILURE_MESSAGES = {
  disconnected: 'Bağlantı yok.',
};

export function useMonitorSocket({source, onEvent}) {
  const remoteQuery = useRemoteSocket(source);
  const [status, setStatus] = useState('connecting');
  const [refusal, setRefusal] = useState(null);
  const onEventRef = useLatest(onEvent);

  const remote = source ? (remoteQuery.data ?? null) : null;
  const isReady = !source || !!remote;

  useEffect(() => {
    if (!isReady) {
      return undefined;
    }
    const connection = remote ?? {
      url: API_ORIGIN,
      namespace: '/monitor',
      path: API_SOCKET_PATH,
      auth: cb => {
        ensureFreshToken()
          .then(token => cb({token}))
          .catch(() => cb({token: null}));
      },
    };
    const socket = io(connection.url + connection.namespace, {
      ...SOCKET_OPTIONS,
      path: connection.path,
      auth: connection.auth ?? {},
    });
    let isReconnecting = false;
    const markDown = () => {
      if (!isReconnecting) {
        setStatus('disconnected');
      }
    };
    const onReconnectAttempt = () => {
      isReconnecting = true;
      setStatus('reconnecting');
    };
    const onReconnectFailed = () => {
      isReconnecting = false;
      setStatus('disconnected');
    };
    socket.on('connect', () => {
      isReconnecting = false;
      setRefusal(null);
      setStatus('connected');
    });
    socket.on('disconnect', reason => {
      if (reason === 'io client disconnect') {
        return;
      }
      if (reason === 'io server disconnect') {
        onReconnectAttempt();
        socket.connect();
        return;
      }
      markDown();
    });
    socket.on('connect_error', error => {
      setRefusal(error?.data?.message ?? null);
      if (!socket.active) {
        isReconnecting = false;
      }
      markDown();
    });
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect_failed', onReconnectFailed);
    socket.onAny((event, payload) => onEventRef.current?.(event, payload));
    return () => {
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect_failed', onReconnectFailed);
      socket.close();
    };
  }, [isReady, remote, onEventRef]);

  let result = {status, error: null};
  if (source && hasBlockingError(remoteQuery)) {
    result = {status: 'error', error: remoteQuery.error};
  } else if (source && remoteQuery.isPending) {
    result = {status: 'resolving', error: null};
  }

  useBusy(['connecting', 'reconnecting', 'resolving'].includes(result.status));

  const {status: currentStatus} = result;
  const wasDroppedRef = useRef(false);
  useEffect(() => {
    const fallback = FAILURE_MESSAGES[currentStatus];
    if (fallback) {
      wasDroppedRef.current = true;
      showConnectionToast('error', refusal ?? fallback);
    } else if (currentStatus === 'connected' && wasDroppedRef.current) {
      wasDroppedRef.current = false;
      showConnectionToast('success', 'Bağlantı yeniden kuruldu.');
    }
  }, [currentStatus, refusal]);

  return result;
}
