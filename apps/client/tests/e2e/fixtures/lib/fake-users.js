import {z} from 'zod';
import {deburr, isNil, omitBy, range} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {toOffsetPagePayload} from '@repo/shared/lib/pagination.js';
import {
  getMultiFilterField,
  getOffsetPaginationSchema,
} from '@repo/shared/schemas/pagination.js';
import {env} from '@/config/env';
import {ApiError} from '@/lib/api-request';
import {getIntlFormatter} from '@/lib/intl';
import {queryToSorting} from '@/lib/table';

const FIRST_NAMES = [
  'Ada',
  'Barış',
  'Cem',
  'Çağla',
  'Deniz',
  'Ece',
  'Emre',
  'Fatma',
  'Gökhan',
  'Hande',
  'İsmail',
  'Jale',
];
const LAST_NAMES = [
  'Yılmaz',
  'Kaya',
  'Demir',
  'Şahin',
  'Çelik',
  'Öztürk',
  'Aydın',
  'Arslan',
];
const DEPARTMENTS = [
  {id: 'yonetim', label: 'Yönetim'},
  {id: 'muhasebe', label: 'Muhasebe'},
  {id: 'satis', label: 'Satış'},
  {id: 'pazarlama', label: 'Pazarlama'},
  {id: 'hukuk', label: 'Hukuk'},
  {id: 'destek', label: 'Destek'},
  {id: 'arge', label: 'Ar-Ge'},
  {id: 'lojistik', label: 'Lojistik'},
  {id: 'satin-alma', label: 'Satın Alma'},
  {id: 'insan-kaynaklari', label: 'İnsan Kaynakları'},
  {id: 'bilgi-islem', label: 'Bilgi İşlem'},
  {id: 'uretim', label: 'Üretim'},
];
const DISABLED_EVERY = 4;

export const FAKE_USER_SORT_FIELDS = Object.freeze(['id', 'name', 'createdAt']);

const listUsersSchema = getOffsetPaginationSchema({
  sort: FAKE_USER_SORT_FIELDS,
  id: getMultiFilterField(z.coerce.number().int()).optional(),
  disabled: getMultiFilterField(z.boolean()).optional(),
  department: getMultiFilterField(
    z.enum(DEPARTMENTS.map(department => department.id)),
  ).optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  seenFrom: z.iso.datetime().optional(),
  seenTo: z.iso.datetime().optional(),
});

const nameCollator = getIntlFormatter(Intl.Collator, {
  numeric: true,
  sensitivity: 'base',
});

const SORT_COMPARATORS = {
  id: (a, b) => a.id - b.id,
  name: (a, b) => nameCollator.compare(a.name, b.name),
  createdAt: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
};

const datasets = new Map();

function toEmailPart(text) {
  return deburr(text).toLowerCase();
}

function createUser(index) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last =
    LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  const round = Math.floor(index / (FIRST_NAMES.length * LAST_NAMES.length));
  const suffix = round ? String(round + 1) : '';
  const createdAt = new Date(
    Date.UTC(2024, 0, 1, 9) + index * 86_400_000,
  ).toISOString();
  return {
    id: index + 1,
    name: suffix ? `${first} ${last} ${suffix}` : `${first} ${last}`,
    email: `${toEmailPart(first)}.${toEmailPart(last)}${suffix}@ornek.com`,
    department: DEPARTMENTS[Math.floor(index / 8) % DEPARTMENTS.length],
    createdAt,
    lastSeenAt: new Date(
      Date.UTC(2024, 5, 1) + index * 11 * 3_600_000,
    ).toISOString(),
    disabledAt:
      index % DISABLED_EVERY === DISABLED_EVERY - 1 ? createdAt : null,
  };
}

function getDataset(total) {
  if (!datasets.has(total)) {
    datasets.set(total, range(total).map(createUser));
  }
  return datasets.get(total);
}

function isBlank(value) {
  return (
    isNil(value) || value === '' || (Array.isArray(value) && !value.length)
  );
}

function parseListQuery(query) {
  const result = listUsersSchema.safeParse(omitBy(query, isBlank));
  if (!result.success) {
    throw new ApiError(result.error.issues[0].message, {
      status: StatusCodes.UNPROCESSABLE_ENTITY,
      errorCode: ErrorCode.VALIDATION_ERROR,
    });
  }
  return result.data;
}

function isMatch(user, {search, id, disabled, department, ...bounds}) {
  const text = search?.toLocaleLowerCase(env.LOCALE);
  const createdDay = user.createdAt.slice(0, 10);
  const seenAt = Date.parse(user.lastSeenAt);
  return [
    !text ||
      String(user.id) === text ||
      user.name.toLocaleLowerCase(env.LOCALE).includes(text) ||
      user.email.includes(text),
    !id || id.includes(user.id),
    !disabled || disabled.includes(user.disabledAt !== null),
    !department || department.includes(user.department.id),
    !bounds.createdFrom || createdDay >= bounds.createdFrom,
    !bounds.createdTo || createdDay <= bounds.createdTo,
    !bounds.seenFrom || seenAt >= Date.parse(bounds.seenFrom),
    !bounds.seenTo || seenAt <= Date.parse(bounds.seenTo),
  ].every(Boolean);
}

function sortUsers(users, sort = []) {
  const sorting = queryToSorting(sort);
  return users.toSorted((a, b) => {
    for (const {id, desc} of sorting) {
      const order = SORT_COMPARATORS[id](a, b);
      if (order) {
        return desc ? -order : order;
      }
    }
    return SORT_COMPARATORS.id(a, b);
  });
}

export const fakeUsers = {
  list({total, query}) {
    const {pageNumber, pageSize, windowSize, sort, ...filters} =
      parseListQuery(query);
    const matches = sortUsers(
      getDataset(total).filter(user => isMatch(user, filters)),
      sort,
    );
    const offset = (pageNumber - 1) * pageSize;
    return toOffsetPagePayload({
      items: matches.slice(offset, offset + pageSize),
      totalItemCount: matches.length,
      pageNumber,
      pageSize,
      offset,
      windowSize,
    });
  },

  toggle({total, id}) {
    const users = getDataset(total);
    const index = users.findIndex(user => user.id === id);
    const user = users[index];
    users[index] = {
      ...user,
      disabledAt: user.disabledAt ? null : user.createdAt,
    };
    return users[index];
  },

  departments() {
    return DEPARTMENTS.map(department => ({...department}));
  },
};
