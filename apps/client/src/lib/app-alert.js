import {isValidElement} from 'react';
import {useAppAlertStore} from '@/stores/app-alert-store';

function open(config) {
  return useAppAlertStore.getState().open(config);
}

function toRenderable(value) {
  const isOptions =
    value !== null &&
    typeof value === 'object' &&
    !isValidElement(value) &&
    !Array.isArray(value);
  return isOptions ? value : {render: value};
}

function resolveRender(render, props) {
  return typeof render === 'function' ? render(props) : render;
}

function resultConfig(type, value, props) {
  if (value === undefined || value === null || value === false) {
    return null;
  }
  const {render, ...options} = toRenderable(value);
  return alertConfig(type, resolveRender(render, props), options);
}

function alertConfig(type, title, options = {}) {
  return {
    title,
    description: options.description,
    type: options.type ?? type,
    showCancel: false,
    confirmText: options.confirmButtonText ?? 'OK',
  };
}

async function openAlert(type, title, options) {
  await open(alertConfig(type, title, options));
}

function confirmConfig(type, title, options, defaults) {
  return {
    title,
    description: options.description ?? defaults.description,
    type: options.type ?? type,
    showCancel: true,
    onConfirm: options.onConfirm,
    pending: resolveRender(toRenderable(options.pending).render, {}),
    onSuccess: options.onSuccess,
    onError: options.onError,
    finally: options.finally,
    successAlert: data => resultConfig('success', options.success, {data}),
    errorAlert: cause =>
      resultConfig('error', options.error, {data: cause, cause}),
    confirmText: options.confirmButtonText ?? defaults.confirmText,
    cancelText: options.cancelButtonText ?? 'Cancel',
  };
}

export function appAlert(title, options) {
  return openAlert('default', title, options);
}

appAlert.confirm = (title, options = {}) =>
  open(confirmConfig('confirm', title, options, {confirmText: 'Confirm'}));

appAlert.confirmDangerous = (title, options = {}) =>
  open(
    confirmConfig('dangerous', title, options, {
      description: 'This action cannot be undone.',
      confirmText: 'Continue',
    }),
  );

appAlert.info = (title, options) => openAlert('info', title, options);

appAlert.warning = (title, options) => openAlert('warning', title, options);

appAlert.success = (title, options) => openAlert('success', title, options);

appAlert.error = (title, options) => openAlert('error', title, options);
