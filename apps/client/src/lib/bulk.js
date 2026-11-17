import {partition} from 'es-toolkit';

export class BulkError extends AggregateError {
  constructor(succeeded, reasons) {
    super(reasons, reasons[0]?.message ?? 'İşlem tamamlanamadı.');
    this.name = 'BulkError';
    this.succeeded = succeeded;
    this.failed = reasons.length;
  }
}

export async function settleAll(items, run) {
  const results = await Promise.allSettled(items.map(item => run(item)));
  const [fulfilled, rejected] = partition(
    results,
    result => result.status === 'fulfilled',
  );
  if (rejected.length > 0) {
    throw new BulkError(
      fulfilled.length,
      rejected.map(result => result.reason),
    );
  }
  return fulfilled.map(result => result.value);
}
