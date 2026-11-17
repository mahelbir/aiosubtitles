import {pick} from 'es-toolkit';
import {DEFAULT_LOCALE} from '@repo/shared/constants/app.js';
import {OPTION_PAGE_SIZE} from '../../../src/lib/option-source.js';
import {
  expectFixtureState,
  openFixture,
  readDigest,
} from '../lib/fixture-page.js';
import {
  API_DEPARTMENTS,
  DEPARTMENTS_FAILURE,
  DEPARTMENTS_FAILURE_PATTERN,
  OPTIONS_LOAD_FAILURE,
  stubDepartments,
} from '../lib/option-lists.js';
import {expect, test} from '../lib/test.js';
import {expectToasts} from '../lib/toasts.js';

const LABELLED_CONTROLS = [
  {name: 'name', label: 'Ad', role: 'textbox'},
  {name: 'note', label: 'Not', role: 'textbox'},
  {name: 'city', label: 'Şehir', role: 'combobox'},
  {name: 'country', label: 'Ülke', role: 'combobox'},
  {name: 'birthDate', label: 'Doğum tarihi', role: 'textbox'},
];

const CHECKBOX_CONTROLS = [
  {name: 'isSubscribed', label: 'Bülten'},
  {name: 'archivedAt', label: 'Arşivlendi'},
];

const CITY_LABELS = ['İstanbul', 'Ankara', 'İzmir'];

const TRIGGER_LOOK = [
  'padding',
  'border',
  'borderRadius',
  'backgroundColor',
  'fontSize',
];

const GROUPED_SELECTS = [
  {label: 'Ofis', istanbul: ['Kadıköy', 'Beşiktaş']},
  {label: 'Şube', istanbul: ['Kadıköy', 'Beşiktaş', 'Üsküdar', 'Şişli']},
];

const LATENCY_MS = 1500;

const SEARCH_LATENCY_MS = 800;

const USER_TOTAL = 150;

const COUNTER_PATTERN = /^\d+ \/ \d+$/;

const CLEAR_SELECTION = 'Clear selection';

const DATE_ORDER_PROBE = '01022000';

const DATE_ORDER_BY_PROBE_VALUE = {
  '2000-01-02': ['month', 'day', 'year'],
  '2000-02-01': ['day', 'month', 'year'],
};

const DEFAULT_DATE_ORDER = ['year', 'month', 'day'];

const CLEARABLE_SELECTS = [
  {label: 'Şehir', name: 'city', option: 'Ankara'},
  {label: 'Ülke', name: 'country', option: 'Fransa'},
];

function getControl(page, label) {
  return page.getByLabel(label, {exact: true});
}

function getSelect(page, name) {
  return page.getByRole('combobox', {name, exact: true});
}

function getChip(page, label, text) {
  return page
    .getByRole('group')
    .filter({has: getSelect(page, label)})
    .getByText(text, {exact: true});
}

async function choose(page, label, options) {
  await getSelect(page, label).click();
  for (const name of options) {
    await page.getByRole('option', {name, exact: true}).click();
  }
}

function readFocused(page) {
  return page.evaluate(() => window.__fixture.focused());
}

async function readTriggerLook(page, label) {
  const {elements} = await readDigest(page);
  const trigger = elements.find(
    element => element.role === 'combobox' && element.label === label,
  );
  return {height: trigger.box.h, ...pick(trigger.style, TRIGGER_LOOK)};
}

async function typeDate(control, monthDayYear) {
  await control.focus();
  await control.pressSequentially(DATE_ORDER_PROBE);
  const order =
    DATE_ORDER_BY_PROBE_VALUE[await control.inputValue()] ?? DEFAULT_DATE_ORDER;
  await control.fill('');
  await control.blur();
  await control.focus();
  const segments = {
    month: monthDayYear.slice(0, 2),
    day: monthDayYear.slice(2, 4),
    year: monthDayYear.slice(4),
  };
  await control.pressSequentially(
    order.map(segment => segments[segment]).join(''),
  );
}

async function clear(control) {
  await control.press('ControlOrMeta+A');
  await control.press('Backspace');
}

test.use({locale: DEFAULT_LOCALE});

test.describe('form controls', () => {
  test.beforeEach(async ({page}) => {
    await openFixture(page, 'form-controls');
  });

  test('every text-like control is reachable by its label and role', async ({
    page,
  }) => {
    for (const {label, role} of LABELLED_CONTROLS) {
      await expect(getControl(page, label)).toBeVisible();
      await expect(
        page.getByRole(role, {name: label, exact: true}),
      ).toBeVisible();
    }
  });

  test('every checkbox is named by its label and reachable through it', async ({
    page,
  }) => {
    for (const {label} of CHECKBOX_CONTROLS) {
      const checkbox = getControl(page, label);

      await expect(checkbox).toHaveRole('checkbox');
      await expect(
        page.getByRole('checkbox', {name: label, exact: true}),
      ).toHaveAttribute('aria-checked', 'false');
      await checkbox.press('Space');
      await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    }
  });

  test('every checkbox toggles from its label', async ({page}) => {
    for (const {label} of CHECKBOX_CONTROLS) {
      await page.getByText(label, {exact: true}).click();

      await expect(getControl(page, label)).toHaveAttribute(
        'aria-checked',
        'true',
      );
    }
  });

  for (const {name, label} of [
    {name: 'name', label: 'Ad'},
    {name: 'note', label: 'Not'},
  ]) {
    test(`an emptied ${name} control stores an empty string`, async ({
      page,
    }) => {
      const control = getControl(page, label);

      await control.pressSequentially('abc');
      await expectFixtureState(page).toMatchObject({
        fields: {[name]: {value: 'abc'}},
      });
      await clear(control);

      await expectFixtureState(page).toMatchObject({
        fields: {[name]: {value: '', type: 'string'}},
      });
    });
  }

  test('the select opens from the keyboard and stores the option value', async ({
    page,
  }) => {
    const city = page.getByRole('combobox', {name: 'Şehir'});
    await city.focus();

    await page.keyboard.press('ArrowDown');

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveText(CITY_LABELS);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(city).toContainText('Ankara');
    await expect(city).toBeFocused();
    await expectFixtureState(page).toMatchObject({
      fields: {city: {value: 'ankara', type: 'string'}},
    });
  });

  test('a select with ten or fewer options opens a plain listbox without a search box', async ({
    page,
  }) => {
    const comboboxes = page.getByRole('combobox');
    const comboboxCount = await comboboxes.count();

    await getSelect(page, 'Şehir').click();

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveText(CITY_LABELS);
    await Promise.all([
      expect(comboboxes).toHaveCount(comboboxCount),
      expect(page.getByRole('searchbox')).toHaveCount(0),
    ]);
  });

  test('a select with more than ten options searches inside its popup', async ({
    page,
  }) => {
    const country = getSelect(page, 'Ülke');
    await country.focus();

    await page.keyboard.press('ArrowDown');

    const search = page.getByRole('combobox', {name: 'Search', exact: true});
    await expect(search).toBeFocused();
    await expect(page.getByRole('option')).toHaveCount(12);

    await page.keyboard.type('Fra');

    await expect(page.getByRole('option')).toHaveText(['Fransa']);

    await page.keyboard.press('Enter');

    await expect(search).toBeHidden();
    await expect(country).toContainText('Fransa');
    await expect(country).toBeFocused();
    await expectFixtureState(page).toMatchObject({
      fields: {country: {value: 'fr', type: 'string'}},
    });
  });

  test('both renderings share the trigger look', async ({page}) => {
    await expect(getSelect(page, 'Ülke')).toBeVisible();

    expect(await readTriggerLook(page, 'Ülke')).toEqual(
      await readTriggerLook(page, 'Şehir'),
    );
  });

  test('a typed date stores its YYYY-MM-DD string', async ({page}) => {
    const date = getControl(page, 'Doğum tarihi');

    await typeDate(date, '03152024');

    await expect(date).toHaveValue('2024-03-15');
    await expectFixtureState(page).toMatchObject({
      fields: {birthDate: {value: '2024-03-15', type: 'string'}},
    });
  });

  test('an emptied date stores undefined', async ({page}) => {
    const date = getControl(page, 'Doğum tarihi');
    await typeDate(date, '03152024');
    await expectFixtureState(page).toMatchObject({
      fields: {birthDate: {value: '2024-03-15'}},
    });

    await date.press('Backspace');

    await expect(date).toHaveValue('');
    await expectFixtureState(page).toMatchObject({
      fields: {birthDate: {type: 'undefined'}},
    });
  });

  for (const typed of ['02312024', '02292023']) {
    test(`refuses the impossible date ${typed}`, async ({page}) => {
      const date = getControl(page, 'Doğum tarihi');

      await typeDate(date, typed);

      await expect(date).toHaveValue('');
      await expectFixtureState(page).toMatchObject({
        fields: {birthDate: {type: 'undefined'}},
      });
    });
  }

  test('an unchecked checkbox stores false and Space toggles it', async ({
    page,
  }) => {
    const checkbox = getControl(page, 'Bülten');
    await checkbox.focus();

    await page.keyboard.press('Space');

    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await expectFixtureState(page).toMatchObject({
      fields: {isSubscribed: {value: true, type: 'boolean'}},
    });

    await page.keyboard.press('Space');

    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await expectFixtureState(page).toMatchObject({
      fields: {isSubscribed: {value: false, type: 'boolean'}},
    });
  });

  test('the timestamp checkbox toggles between null and an ISO timestamp', async ({
    page,
  }) => {
    const label = page.getByText('Arşivlendi', {exact: true});

    await label.click();

    await expectFixtureState(page).toMatchObject({
      fields: {
        archivedAt: {
          value: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          ),
        },
      },
    });

    await label.click();

    await expectFixtureState(page).toMatchObject({
      fields: {archivedAt: {value: null, type: 'object'}},
    });
  });

  for (const {name, label} of [...LABELLED_CONTROLS, ...CHECKBOX_CONTROLS]) {
    test(`${name} composes the caller’s blur handler and description with the bound ones`, async ({
      page,
    }) => {
      const control = getControl(page, label);
      await control.focus();

      await page.keyboard.press('Shift+Tab');

      await expect(control).not.toBeFocused();
      await expect(control).toHaveAccessibleDescription(
        `Harici açıklama. ${label} yardımı.`,
      );
      await expectFixtureState(page).toMatchObject({
        callerBlurs: {[name]: 1},
        hookBlurs: [name],
      });
    });
  }
});

test.describe('form controls over an option source', () => {
  test('options carrying a group render under their group heading', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {options: 'grouped'});

    for (const {label, istanbul} of GROUPED_SELECTS) {
      await getSelect(page, label).click();

      const group = page
        .getByRole('listbox')
        .getByRole('group', {name: 'İstanbul', exact: true});
      await expect(group).toBeVisible();
      await expect(group.getByRole('option')).toHaveText(istanbul);

      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toBeHidden();
    }
  });

  test('a select still loading its options says so in their place', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'memory',
      delay: LATENCY_MS,
    });
    await getSelect(page, 'Departman').focus();

    await page.keyboard.press('ArrowDown');

    await Promise.all([
      expect(page.getByText('Loading…')).toBeVisible(),
      expect(page.getByRole('option')).toHaveCount(0),
    ]);
  });

  test('a combobox still loading a preloaded list says loading, not searching', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'tags',
      delay: LATENCY_MS,
    });

    await getSelect(page, 'Etiketler').press('ArrowDown');

    await expect(page.getByText('Loading…')).toBeVisible();
    await expect(page.getByText('Searching…')).toBeHidden();
  });

  test('the trigger keeps focus when a preloaded list lands past the threshold', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'memory',
      delay: LATENCY_MS,
    });
    const department = getSelect(page, 'Departman');
    await department.focus();
    await expect(department).toHaveAttribute('aria-haspopup', 'listbox');
    const focused = await readFocused(page);

    await expect(department).toHaveAttribute('aria-haspopup', 'dialog');

    expect(focused).toContain('"Departman"');
    expect(await readFocused(page)).toBe(focused);
    await expect(department).toBeFocused();
  });

  test('an open select keeps its rendering until it closes, then hands focus to the new trigger', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'memory',
      delay: LATENCY_MS,
    });
    const department = getSelect(page, 'Departman');
    await department.click();
    await expect(page.getByRole('listbox')).toBeVisible();

    await expect(page.getByRole('option')).toHaveCount(12);
    await expect(department).toHaveAttribute('aria-haspopup', 'listbox');

    await page.keyboard.press('Escape');

    await expect(department).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(department).toBeFocused();
  });

  test('a chosen value is cleared from the list in either rendering', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls');
    for (const {label, name, option} of CLEARABLE_SELECTS) {
      const select = getSelect(page, label);
      await select.click();
      await expect(
        page.getByRole('option', {name: CLEAR_SELECTION, exact: true}),
      ).toHaveCount(0);
      await page.getByRole('option', {name: option, exact: true}).click();
      await expect(select).toContainText(option);

      await select.click();
      await page
        .getByRole('option', {name: CLEAR_SELECTION, exact: true})
        .click();

      await expect(select).not.toContainText(option);
      await expectFixtureState(page).toMatchObject({
        fields: {[name]: {value: null}},
      });
    }
  });

  test('a select over a remote source searches on the server, saying so while it waits', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'users',
      delay: SEARCH_LATENCY_MS,
    });
    const user = getSelect(page, 'Kullanıcı');
    await expect(user).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click();
    await expect(page.getByRole('option')).toHaveCount(OPTION_PAGE_SIZE);
    await expect(
      page.getByText(`${OPTION_PAGE_SIZE} / ${USER_TOTAL}`),
    ).toBeVisible();

    await page.keyboard.type('ada.yilmaz');

    await expect(page.getByText('Searching…')).toBeVisible();
    await expect(page.getByRole('option')).toHaveText([
      'Ada Yılmaz',
      'Ada Yılmaz 2',
    ]);
    await expect(page.getByText('Searching…')).toBeHidden();

    await page.keyboard.press('Enter');

    await expect(user).toContainText('Ada Yılmaz');
    await expectFixtureState(page).toMatchObject({
      fields: {user: {value: 1, type: 'number'}},
    });
  });
});

test.describe('form controls over a multi-select', () => {
  test('chips are added by choosing and removed with Backspace', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {options: 'members'});

    await choose(page, 'Üyeler', ['Ada Yılmaz', 'Barış Yılmaz']);

    await expect(getChip(page, 'Üyeler', 'Ada Yılmaz')).toBeVisible();
    await expect(getChip(page, 'Üyeler', 'Barış Yılmaz')).toBeVisible();
    await expectFixtureState(page).toMatchObject({
      fields: {members: {value: [1, 2]}},
    });

    await getSelect(page, 'Üyeler').press('Backspace');

    await expect(getChip(page, 'Üyeler', 'Barış Yılmaz')).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      fields: {members: {value: [1]}},
    });
  });

  test('a known disabled option renders a chip that cannot be removed', async ({
    page,
  }) => {
    await stubDepartments(page);
    await openFixture(page, 'form-controls', {options: 'held'});
    const held = getChip(page, 'Departmanlar', 'Arşiv');
    await expect(held).toBeVisible();
    await expect(held.getByRole('button')).toHaveCount(0);
    await choose(page, 'Departmanlar', ['Destek']);
    await expectFixtureState(page).toMatchObject({
      fields: {departments: {value: ['arsiv', 'destek']}},
    });

    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await page.keyboard.press('Escape');

    await expect(held).toBeVisible();
    await expect(getChip(page, 'Departmanlar', 'Destek')).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      fields: {departments: {value: ['arsiv']}},
    });
  });

  test('max disables the remaining options and says why', async ({page}) => {
    await openFixture(page, 'form-controls', {options: 'members', max: 2});
    await choose(page, 'Üyeler', ['Ada Yılmaz']);
    await expect(page.getByRole('option', {disabled: true})).toHaveCount(0);

    await page.getByRole('option', {name: 'Barış Yılmaz', exact: true}).click();

    await expect(page.getByText('You can select up to 2.')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(OPTION_PAGE_SIZE);
    await expect(page.getByRole('option', {disabled: true})).toHaveCount(
      OPTION_PAGE_SIZE - 2,
    );
    for (const name of ['Ada Yılmaz', 'Barış Yılmaz']) {
      await expect(
        page.getByRole('option', {name, exact: true}),
      ).not.toHaveAttribute('aria-disabled', 'true');
    }
    await expect(
      page.getByRole('option', {name: 'Cem Yılmaz', exact: true}),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  test('a chosen chip keeps its label after a remote search moves on', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {options: 'members'});
    const members = getSelect(page, 'Üyeler');
    await members.pressSequentially('Ada');
    await page.getByRole('option', {name: 'Ada Aydın', exact: true}).click();

    await members.pressSequentially('Cem');

    await expect(page.getByRole('option')).toHaveCount(13);
    await expect(page.getByRole('option').first()).toHaveText('Cem Yılmaz');
    await expect(getChip(page, 'Üyeler', 'Ada Aydın')).toBeVisible();
    await expect(getChip(page, 'Üyeler', '73')).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      fields: {members: {value: [73]}},
    });
  });

  test('the counter shows only while more pages remain', async ({page}) => {
    await openFixture(page, 'form-controls', {options: 'members'});
    const members = getSelect(page, 'Üyeler');

    await members.click();

    await expect(
      page.getByText(`${OPTION_PAGE_SIZE} / ${USER_TOTAL}`),
    ).toBeVisible();

    await members.pressSequentially('Ada');

    await expect(page.getByRole('option')).toHaveCount(13);
    await expect(page.getByText(COUNTER_PATTERN)).toHaveCount(0);
  });

  test('scrolling to the end of the list loads the next page', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {options: 'members'});
    await getSelect(page, 'Üyeler').click();
    await expect(page.getByRole('option')).toHaveCount(OPTION_PAGE_SIZE);

    await page
      .getByRole('listbox')
      .evaluate(list => list.scrollTo({top: list.scrollHeight}));

    await expect(page.getByRole('option')).toHaveCount(2 * OPTION_PAGE_SIZE);
    await expect(
      page.getByText(`${2 * OPTION_PAGE_SIZE} / ${USER_TOTAL}`),
    ).toBeVisible();
  });

  test('arrowing to the last option loads the next page', async ({page}) => {
    await openFixture(page, 'form-controls', {options: 'members'});
    await getSelect(page, 'Üyeler').click();
    await expect(page.getByRole('option')).toHaveCount(OPTION_PAGE_SIZE);

    await page.keyboard.press('ArrowUp');

    await expect(page.getByRole('option')).toHaveCount(2 * OPTION_PAGE_SIZE);
  });
});

test.describe('form controls over free and creatable tags', () => {
  test('Enter turns the typed text into a tag stored as written', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {options: 'tags'});
    const tags = getSelect(page, 'Etiketler');

    await tags.pressSequentially('  Acil ');
    await tags.press('Enter');

    await expect(getChip(page, 'Etiketler', 'Acil')).toBeVisible();
    await expect(
      page.getByRole('button', {name: 'Remove: Acil', exact: true}),
    ).toBeVisible();
    await expect(tags).toHaveValue('');
    await expectFixtureState(page).toMatchObject({
      fields: {tags: {value: ['Acil']}},
    });
  });

  test('a suggestion adds its label as a tag', async ({page}) => {
    await openFixture(page, 'form-controls', {options: 'tags'});

    await choose(page, 'Etiketler', ['Destek']);

    await expect(getChip(page, 'Etiketler', 'Destek')).toBeVisible();
    await expectFixtureState(page).toMatchObject({
      fields: {tags: {value: ['Destek']}},
    });
  });

  test('a duplicate tag is ignored', async ({page}) => {
    await openFixture(page, 'form-controls', {options: 'tags'});
    const tags = getSelect(page, 'Etiketler');

    await tags.pressSequentially('Acil');
    await tags.press('Enter');
    await tags.pressSequentially('Acil');
    await tags.press('Enter');

    await expect(getChip(page, 'Etiketler', 'Acil')).toHaveCount(1);
    await expect(tags).toHaveValue('');
    await expectFixtureState(page).toMatchObject({
      fields: {tags: {value: ['Acil']}},
    });
  });

  test('a text with no exact match offers to create it', async ({page}) => {
    await openFixture(page, 'form-controls', {options: 'creatable'});
    const records = getSelect(page, 'Kayıtlar');

    await records.pressSequentially('Yeni');

    await expect(
      page.getByRole('option', {name: 'Create: "Yeni"', exact: true}),
    ).toBeVisible();

    await clear(records);
    await records.pressSequentially('Dest');

    await expect(
      page.getByRole('option', {name: 'Create: "Dest"', exact: true}),
    ).toBeVisible();

    for (const text of ['Destek', 'destek']) {
      await clear(records);
      await records.pressSequentially(text);

      await expect(
        page.getByRole('option', {name: 'Destek', exact: true}),
      ).toBeVisible();
      await expect(page.getByRole('option', {name: /^Create/})).toHaveCount(0);
    }
  });

  test('choosing create awaits the caller and selects the new record', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'creatable',
      delay: SEARCH_LATENCY_MS,
    });
    const records = getSelect(page, 'Kayıtlar');
    await records.pressSequentially('Yeni');

    await page
      .getByRole('option', {name: 'Create: "Yeni"', exact: true})
      .click();

    await expect(getChip(page, 'Kayıtlar', 'Yeni')).toBeVisible();
    await expect(records).toHaveValue('');
    await expectFixtureState(page).toMatchObject({
      created: ['Yeni'],
      fields: {records: {value: ['yeni']}},
    });
  });

  test('a create resolving late keeps the chip changes made while it waited', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'creatable',
      delay: SEARCH_LATENCY_MS,
    });
    const records = getSelect(page, 'Kayıtlar');
    await choose(page, 'Kayıtlar', ['Destek']);
    await expect(getChip(page, 'Kayıtlar', 'Destek')).toBeVisible();
    await records.pressSequentially('Yeni');
    await page
      .getByRole('option', {name: 'Create: "Yeni"', exact: true})
      .click();

    await page
      .getByRole('button', {name: 'Remove: Destek', exact: true})
      .click();

    await expect(getChip(page, 'Kayıtlar', 'Yeni')).toBeVisible();
    await expect(getChip(page, 'Kayıtlar', 'Destek')).toHaveCount(0);
    await expectFixtureState(page).toMatchObject({
      created: ['Yeni'],
      fields: {records: {value: ['yeni']}},
    });
  });

  test('a remote source offers to create only for searched text with no exact match', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'creatable',
      source: 'remote',
    });
    const records = getSelect(page, 'Kayıtlar');
    const createOption = page.getByRole('option', {name: /^Create/});
    await records.click();
    await expect(page.getByRole('option')).toHaveCount(OPTION_PAGE_SIZE);

    await records.pressSequentially('Z');

    await expect(page.getByText('Searching…')).toBeHidden();
    await expect(createOption).toHaveCount(0);

    await clear(records);
    await records.pressSequentially('Ada Yılmaz');

    await expect(
      page.getByRole('option', {name: 'Ada Yılmaz', exact: true}),
    ).toBeVisible();
    await expect(page.getByText('Searching…')).toBeHidden();
    await expect(createOption).toHaveCount(0);

    await clear(records);
    await records.pressSequentially('Zzzz Yok');

    await expect(
      page.getByRole('option', {name: 'Create: "Zzzz Yok"', exact: true}),
    ).toBeVisible();
  });

  test('a rejected create keeps the text and selects nothing', async ({
    page,
  }) => {
    await openFixture(page, 'form-controls', {
      options: 'creatable',
      create: 'fail',
    });
    const records = getSelect(page, 'Kayıtlar');
    await records.pressSequentially('Yeni');

    await page
      .getByRole('option', {name: 'Create: "Yeni"', exact: true})
      .click();

    await expectFixtureState(page).toMatchObject({
      created: ['Yeni'],
      fields: {records: {value: []}},
    });
    await expect(records).toHaveValue('Yeni');
    await expect(getChip(page, 'Kayıtlar', 'Yeni')).toHaveCount(0);
  });
});

test.describe('form controls over an options query', () => {
  test('the select lists the options its query loaded and stores the picked value', async ({
    page,
  }) => {
    await stubDepartments(page);
    await openFixture(page, 'form-controls', {options: 'api'});
    const department = getSelect(page, 'Departman');
    await department.focus();

    await page.keyboard.press('ArrowDown');

    await Promise.all([
      expect(page.getByRole('option')).toHaveText(
        API_DEPARTMENTS.map(option => option.label),
      ),
      expect(page.getByText(OPTIONS_LOAD_FAILURE)).toHaveCount(0),
    ]);

    await page.getByRole('option', {name: 'Hukuk'}).click();

    await expect(department).toContainText('Hukuk');
    await expectFixtureState(page).toMatchObject({
      fields: {department: {value: 'hukuk', type: 'string'}},
    });
  });

  test.describe(`with its options failing with ${DEPARTMENTS_FAILURE.name}`, () => {
    test.use({allowedConsoleError: DEPARTMENTS_FAILURE_PATTERN});

    test('the select shows the load failure in place of the options, while a static one keeps its own', async ({
      page,
    }) => {
      await stubDepartments(page, () => DEPARTMENTS_FAILURE.response);
      await openFixture(page, 'form-controls', {options: 'api'});
      await getSelect(page, 'Departman').focus();

      await page.keyboard.press('ArrowDown');

      await Promise.all([
        expect(page.getByText(OPTIONS_LOAD_FAILURE)).toBeVisible(),
        expect(page.getByRole('option')).toHaveCount(0),
      ]);

      await page.keyboard.press('Escape');
      await getSelect(page, 'Şehir').focus();
      await page.keyboard.press('ArrowDown');

      await Promise.all([
        expect(page.getByRole('option')).toHaveText(CITY_LABELS),
        expect(page.getByText(OPTIONS_LOAD_FAILURE)).toBeHidden(),
      ]);
      await expectToasts(page, []);
    });

    test('a multi-select whose options fail lists none of them, while a held chip keeps its label', async ({
      page,
    }) => {
      await stubDepartments(page, () => DEPARTMENTS_FAILURE.response);
      await openFixture(page, 'form-controls', {options: 'held'});
      await getSelect(page, 'Departmanlar').focus();

      await page.keyboard.press('ArrowDown');

      await expect(page.getByText(OPTIONS_LOAD_FAILURE)).toBeVisible();
      await Promise.all([
        expect(page.getByRole('option')).toHaveCount(0),
        expect(getChip(page, 'Departmanlar', 'Arşiv')).toBeVisible(),
      ]);
    });
  });
});
