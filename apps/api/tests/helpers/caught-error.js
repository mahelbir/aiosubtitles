export function catchError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

export function toErrorText(error) {
  return `${error.message} ${String(error.cause)} ${error.cause?.message} ${JSON.stringify(error)}`;
}
