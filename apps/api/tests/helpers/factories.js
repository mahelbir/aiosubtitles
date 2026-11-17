import {FixtureRecord, FixtureTag} from './fixture-models.js';

export const EMAIL_DOMAIN = 'example.com';

let sequence = 0;

function nextName(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function toEmail(name) {
  return `${name}@${EMAIL_DOMAIN}`;
}

export async function createFixtureTag({rank, ...values} = {}) {
  return FixtureTag.create({label: values.label ?? nextName('tag'), rank});
}

export async function createFixtureRecord({tags = [], ...values} = {}) {
  const record = await FixtureRecord.create({
    name: values.name ?? toEmail(nextName('record')),
    secret: values.secret ?? null,
    disabledAt: values.disabledAt ?? null,
  });
  if (tags.length > 0) {
    await record.addTags(tags.map(tag => tag.id));
  }
  return record;
}
