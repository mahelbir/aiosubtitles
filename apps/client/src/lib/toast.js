import {toast} from 'react-toastify/unstyled';

function off(value) {
  return value === false ? null : value;
}

export function withToast(
  promise,
  {finally: onSettled, onSuccess, onError, ...messages} = {},
  options,
) {
  let result = toast.promise(
    promise,
    {
      pending: off(messages.pending ?? '…'),
      success: off(messages.success),
      error: off(messages.error),
    },
    {
      autoClose: false,
      ...options,
    },
  );
  if (onSuccess || onError) {
    result = result.then(
      data => {
        onSuccess?.(data);
        return data;
      },
      cause => {
        onError?.(cause);
        throw cause;
      },
    );
  }
  return onSettled ? result.finally(onSettled) : result;
}
