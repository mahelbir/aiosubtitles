import {DataTypes} from 'sequelize';
import {BaseModel} from '../../src/db/base-model.js';
import {IDENTIFIER_COLLATION, collateColumn} from '../../src/db/collation.js';
import {sequelize} from '../../src/db/index.js';
import {dbUtils} from '../../src/db/utils.js';

const NAME_MAX_LENGTH = 255;
const LABEL_MAX_LENGTH = 120;

export class FixtureRecord extends BaseModel {
  static notFoundMessage = 'Fixture kaydı bulunamadı.';
  static sensitiveAttributes = ['secret'];
  static tagsInclude = {
    association: 'tags',
    attributes: ['id', 'label', 'rank'],
    through: {attributes: []},
  };
}

FixtureRecord.init(
  {
    id: dbUtils.uuidPrimaryKey(),
    name: {
      type: DataTypes.STRING(NAME_MAX_LENGTH),
      allowNull: false,
      unique: {msg: 'Bu ad zaten kullanımda.'},
    },
    secret: {
      type: DataTypes.STRING(NAME_MAX_LENGTH),
      allowNull: true,
      defaultValue: null,
    },
    disabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {sequelize, tableName: 'fixture_records'},
);

export class FixtureTag extends BaseModel {}

FixtureTag.init(
  {
    id: dbUtils.uuidPrimaryKey(),
    label: {
      type: DataTypes.STRING(LABEL_MAX_LENGTH),
      allowNull: false,
    },
    rank: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {sequelize, tableName: 'fixture_tags'},
);

export class FixtureRecordTag extends BaseModel {}

FixtureRecordTag.init(
  {
    recordId: {type: DataTypes.UUID, primaryKey: true},
    tagId: {type: DataTypes.UUID, primaryKey: true},
  },
  {sequelize, tableName: 'fixture_record_tags'},
);

FixtureRecord.belongsToMany(FixtureTag, {
  through: FixtureRecordTag,
  foreignKey: 'recordId',
  otherKey: 'tagId',
  as: 'tags',
});
FixtureTag.belongsToMany(FixtureRecord, {
  through: FixtureRecordTag,
  foreignKey: 'tagId',
  otherKey: 'recordId',
  as: 'records',
});

FixtureRecord.addScope('withTags', {
  attributes: {exclude: FixtureRecord.sensitiveAttributes},
  include: [FixtureRecord.tagsInclude],
});
FixtureRecord.addScope('rankedAtMost', maxRank => ({
  where: dbUtils.relatedMaxAtMost(
    {
      through: FixtureRecordTag,
      foreignKey: 'recordId',
      otherKey: 'tagId',
      target: FixtureTag,
      attribute: 'rank',
      limit: maxRank,
    },
    FixtureRecord,
  ),
}));

const COLLATED_COLUMNS = [
  {table: 'fixture_records', column: 'name'},
  {table: 'fixture_records', column: 'secret'},
  {table: 'fixture_tags', column: 'label'},
];

export async function createFixtureTables() {
  const queryInterface = sequelize.getQueryInterface();
  await sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      'fixture_records',
      {
        id: dbUtils.uuidPrimaryKey(),
        name: {
          type: DataTypes.STRING(NAME_MAX_LENGTH),
          allowNull: false,
          unique: true,
        },
        secret: {type: DataTypes.STRING(NAME_MAX_LENGTH), allowNull: true},
        disabled_at: {type: DataTypes.DATE, allowNull: true},
      },
      {transaction},
    );
    await queryInterface.createTable(
      'fixture_tags',
      {
        id: dbUtils.uuidPrimaryKey(),
        label: {type: DataTypes.STRING(LABEL_MAX_LENGTH), allowNull: false},
        rank: {type: DataTypes.INTEGER, allowNull: false},
      },
      {transaction},
    );
    await queryInterface.createTable(
      'fixture_record_tags',
      {
        record_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: {model: 'fixture_records', key: 'id'},
          onDelete: 'CASCADE',
        },
        tag_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: {model: 'fixture_tags', key: 'id'},
          onDelete: 'RESTRICT',
        },
      },
      {transaction},
    );
    for (const entry of COLLATED_COLUMNS) {
      await collateColumn(
        {...entry, collation: IDENTIFIER_COLLATION, transaction},
        queryInterface,
      );
    }
  });
}
