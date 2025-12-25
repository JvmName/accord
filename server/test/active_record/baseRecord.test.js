const { BaseRecord }              = require('../../lib/active_record/baseRecord');
const { Connection}               = require('../../lib/active_record/db/connection');
const { ConnectionConfiguration } = require('../../lib/active_record/db/connectionConfiguration');
const { getActiveRecordSchema }   = require('../../lib/active_record/db/schema');
const   importSchema              = require('../../lib/active_record/db/importSchema');
const { Model, Sequelize }        = require('sequelize');
const   TestHelpers               = require('../helpers');


const connectionConfig = {database: ' ', host: ' ', password: ' ', username: ' '};
const configSpy        = jest.spyOn(ConnectionConfiguration, '_fetchAllConfigs');
configSpy.mockImplementation(() => ({default: {test: connectionConfig}}));

const mockSequelize = new (class MockSequelize {})();
const connectionSpy = jest.spyOn(Connection.prototype, '_sequelize', 'get');
connectionSpy.mockImplementation(() => mockSequelize);


jest.mock('sequelize', () => {
    class MockModel {
        static init     = jest.fn()
        static findByPk = jest.fn();
        static findAll  = jest.fn();
    }
    const TestHelpers    = require('../helpers');
    const dataTypeKey1   = TestHelpers.Faker.Text.randomString(10);
    const dataTypeValue1 = TestHelpers.Faker.Text.randomString(10);
    const dataTypeKey2   = TestHelpers.Faker.Text.randomString(10);
    const dataTypeValue2 = TestHelpers.Faker.Text.randomString(10);
    const Sequelize = {DataTypes: {
        [dataTypeKey1]: {types: {postgres: [dataTypeValue1]}, key: dataTypeKey1},
        [dataTypeKey2]: {types: {postgres: [dataTypeValue2]}, key: dataTypeKey2},
        postgres:       {}
    }};
    return { Model: MockModel, Sequelize } ;
});

const dataTypeKey1   = Object.keys(Sequelize.DataTypes)[0];
const dataTypeKey2   = Object.keys(Sequelize.DataTypes)[1];
const dataTypeValue1 = Sequelize.DataTypes[dataTypeKey1].types.postgres[0];
const dataTypeValue2 = Sequelize.DataTypes[dataTypeKey2].types.postgres[0];


jest.mock('../../lib/active_record/db/importSchema', () => jest.fn());
importSchema.mockImplementation(() => ({created_at: {type: dataTypeValue1}, updated_at: {type: dataTypeValue2}}));


afterEach(() => {
    jest.clearAllMocks();
});


describe('ActiveRecord', () => {
    describe('ActiveRecord#constructor', () => {
        it ('will throw an error when creating an instance of BaseRecord', () => {
            expect(() => new BaseRecord()).toThrow();
        });
    });


    describe('ActiveRecord.initialize', () => {
        it ('calls `getActiveRecordSchema` and passes the response to init', () => {
            class User extends BaseRecord {}
            User.initialize();
            const tableDetails = {created_at: {type: Sequelize.DataTypes[dataTypeKey1]},
                                  updated_at: {type: Sequelize.DataTypes[dataTypeKey2]}
            };
            expect(importSchema).toHaveBeenCalledTimes(1);
            expect(Model.init).toHaveBeenCalledTimes(1);
            expect(Model.init).toHaveBeenCalledWith(tableDetails,
                                                    {
                                                      createdAt: 'created_at',
                                                      deletedAt: 'deleted_at',
                                                      modelName: 'User',
                                                      sequelize: mockSequelize,
                                                      tableName: 'users',
                                                      updatedAt: 'updated_at'
                                                    });
        });

        it ('uses `timestamps: false` when the schema has no timestamps', () => {
            importSchema.mockImplementation(() => ({}));
            class User extends BaseRecord {}
            User.initialize();
            expect(Model.init).toHaveBeenCalledWith({},
                                                    {
                                                      createdAt: 'created_at',
                                                      deletedAt: 'deleted_at',
                                                      modelName: 'User',
                                                      sequelize: mockSequelize,
                                                      tableName: 'users',
                                                      timestamps: false,
                                                      updatedAt: 'updated_at'
                                                    });
        });

        it ('does not run twice on the same model', () => {
            class User extends BaseRecord {}
            User.initialize();
            User.initialize();
            expect(Model.init).toHaveBeenCalledTimes(1);
        });

        it ('does run once per model', () => {
            class User extends BaseRecord {}
            class Team extends BaseRecord {}
            User.initialize();
            Team.initialize();
            expect(Model.init).toHaveBeenCalledTimes(2);
        });

        it ('will throw an error when run on BaseRecord', () => {
            expect(() => BaseRecord.initialize()).toThrow();
        });
    });


    describe('ActiveRecord.tableName', () => {
        it ('defaults to the puralized version of the class name', () => {
            class User extends BaseRecord {}
            expect(User._tableName).toEqual('users');
        });

        it ('handles atypical pluralizations', () => {
            class Person extends BaseRecord {}
            expect(Person._tableName).toEqual('people');
        });

        it ('converts to snake case', () => {
            class BigDog extends BaseRecord {}
            expect(BigDog._tableName).toEqual('big_dogs');
        });

        it ('can be overridden', () => {
            class User extends BaseRecord {
                static _tableName = 'foo';
            }
            expect(User._tableName).toEqual('foo');
        });
    });


    describe('ActiveRecord#find', () => {
        it ('calls the sequelize `findByPk` method', async () => {
            class Person extends BaseRecord {}
            Person.initialize();
            const id          = Math.random();
            await Person.find(id);
            expect(Person.findByPk).toHaveBeenCalledTimes(1);
            expect(Person.findByPk).toHaveBeenCalledWith(id);
        });
    });


    describe('ActiveRecord#where', () => {
        const column    = TestHelpers.Faker.Text.randomString(10);
        const value     = TestHelpers.Faker.Text.randomString(10);
        const condition = {[column]: value};
        class Person extends BaseRecord {}
        Person.initialize();

        it ('calls findAll with the provided condition', async () => {
            await Person.where(condition);
            expect(Person.findAll).toHaveBeenCalledWith({where: condition});
        });

        it ('passes additional options', async () => {
            const option1 = TestHelpers.Faker.Text.randomString(10);
            const option2 = TestHelpers.Faker.Text.randomString(10);
            const value1 = TestHelpers.Faker.Text.randomString(10);
            const value2 = TestHelpers.Faker.Text.randomString(10);
            const options = {[option1]: value1, [option2]: value2};

            await Person.where(condition, options);
            const expected = {...options, where: condition };
            expect(Person.findAll).toHaveBeenCalledWith(expected);
        });
    });
});
