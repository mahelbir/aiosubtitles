import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {DataTypes, QueryTypes} from 'sequelize';
import {config} from '../../src/config/index.js';
import {LOCALE_COLLATION, withCollation} from '../../src/db/collation.js';
import {sequelize} from '../../src/db/index.js';
import {dbUtils} from '../../src/db/utils.js';

const Phrase = sequelize.define(
  'Phrase',
  {
    text: {
      type: withCollation(DataTypes.STRING(100), LOCALE_COLLATION),
      allowNull: false,
    },
  },
  {tableName: 'phrases', timestamps: false},
);

const phrasesMatching = async term => {
  const rows = await Phrase.findAll({
    where: {text: dbUtils.iLike(term)},
    attributes: ['text'],
    order: [['text', 'ASC']],
    raw: true,
  });
  return rows.map(row => row.text);
};

beforeAll(async () => {
  await Phrase.sync();
});

beforeEach(async () => {
  await Phrase.truncate();
});

afterAll(async () => {
  await Phrase.drop();
});

describe('the locale collation', () => {
  it('is ICU at the app locale', async () => {
    const collation = await sequelize.query(
      'SELECT collprovider AS provider, colllocale AS locale FROM pg_collation WHERE collname = :name',
      {
        replacements: {name: LOCALE_COLLATION},
        type: QueryTypes.SELECT,
        plain: true,
      },
    );

    expect(collation).toEqual({provider: 'i', locale: config.locale});
  });

  it('sorts text by the alphabet of the app locale', async () => {
    await Phrase.bulkCreate(
      ['Zeynep', 'Şule', 'Ömer', 'İsmail', 'ılık', 'Çağrı', 'Ali'].map(
        text => ({text}),
      ),
    );

    expect(await phrasesMatching('')).toEqual([
      'Ali',
      'Çağrı',
      'ılık',
      'İsmail',
      'Ömer',
      'Şule',
      'Zeynep',
    ]);
  });

  it('folds case by the rules of the app locale in a loose match', async () => {
    await Phrase.bulkCreate(
      ['ISPARTA', 'İSTANBUL', 'Şirket Yönetimi'].map(text => ({text})),
    );

    expect(await phrasesMatching('ısparta')).toEqual(['ISPARTA']);
    expect(await phrasesMatching('istanbul')).toEqual(['İSTANBUL']);
    expect(await phrasesMatching('ŞİRKET')).toEqual(['Şirket Yönetimi']);
    expect(await phrasesMatching('isparta')).toEqual([]);
  });
});
