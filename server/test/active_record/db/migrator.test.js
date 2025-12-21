const { ConnectionConfiguration } = require('../../../lib/active_record/db/connectionConfiguration');
const { Migrator }                = require('../../../lib/active_record/db/migrator');
const { QueryInterface }          = require('../../../lib/active_record/db/queryInterface');
const { Sequelize }               = require('sequelize');
const   TestHelpers               = require('../../helpers');


const connectionConfig = {database: ' ', host: ' ', password: ' ', username: ' '};
const migrationModule  = {up: jest.fn(), down: jest.fn()};

const configSpy  = jest.spyOn(ConnectionConfiguration, '_fetchAllConfigs');
configSpy.mockImplementation(() => ({default: {test: connectionConfig}}));

const transactionSpy = jest.spyOn(QueryInterface.prototype, 'transaction');
transactionSpy.mockImplementation(callback => callback());

const MockQueryInterface = {
    createTable:  jest.fn(),
    dropTable:    jest.fn(),
    addColumn:    jest.fn(),
    removeColumn: jest.fn(),
    addIndex:     jest.fn(),
    removeIndex:  jest.fn(),
    renameColumn: jest.fn(),
    changeColumn: jest.fn()
}
jest.mock('sequelize', () => {
    class MockSequelize {
        static DataTypes = {INTEGER: 'INTEGER', DATE: 'DATE'};
    }
    return {Sequelize: MockSequelize};
});

Sequelize.prototype.getQueryInterface = () => MockQueryInterface;


afterEach(() => {
    jest.clearAllMocks();
});


describe('Migrator', () => {
    const migrator = new Migrator();
    const moduleSpy = jest.spyOn(migrator, 'migrationModule', 'get');
    moduleSpy.mockImplementation(() => migrationModule);

    describe('Migrator#run', () => {
        it ('calls the migration migrate `up` callback within a transaction', async () => {
            await migrator.run();
            expect(transactionSpy).toHaveBeenCalledTimes(1);
            expect(migrationModule.up).toHaveBeenCalledTimes(1);
        });

        it ('throws an error if there is no `up`', async () => {
            const origUp = migrationModule.up;
            delete migrationModule.up

            expect(async () => {await migrator.run()}).rejects.toThrow();

            migrationModule.up = origUp;
        });
    });


    describe('Migrator#down', () => {
        it ('calls the migration migrate `down` callback within a transaction', async () => {
            await migrator.rollback();
            expect(transactionSpy).toHaveBeenCalledTimes(1);
            expect(migrationModule.down).toHaveBeenCalledTimes(1);
        });

        it ('does not throw an error if there is no `down`', async () => {
            const origDown = migrationModule.down;
            delete migrationModule.down

            try {
                await migrator.rollback();
            } catch(err) {
                expect(1).toBe(2); // if we get here, an error was thrown
            }

            migrationModule.down = origDown;
        });
    });


    describe('Migrator#createTable', () => {
        const idCol      = { allowNull: false, autoIncrement: true, primaryKey: true, type: 'INTEGER'};
        const createdCol = {allowNull: false, type: 'DATE'};
        const updatedCol = {allowNull: false, type: 'DATE'};

        it ('calls `createTable` on the query interface and includes default columns', async () => {
            const tableName = TestHelpers.Faker.Text.randomString(10);
            const details   = {
                id:         idCol,
                [TestHelpers.Faker.Text.randomString(10).toLowerCase()]:  Math.random(),
                created_at: createdCol,
                updated_at: updatedCol,
            };

            await migrator.createTable(tableName, details);
            expect(MockQueryInterface.createTable).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.createTable).toHaveBeenCalledWith(tableName, details);
        });

        it ('ensures the columns are snake cased', async () => {
            const tableName = TestHelpers.Faker.Text.randomString(10);
            const details   = {
                id:         idCol,
                myColumn:   1,
                created_at: createdCol,
                updated_at: updatedCol,
            };

            await migrator.createTable(tableName, details);
            expect(MockQueryInterface.createTable).toHaveBeenCalledWith(tableName, {
                id:         idCol,
                my_column:  1,
                created_at: createdCol,
                updated_at: updatedCol,
            });
        });
    });


    describe('Migrator#dropTable', () => {
        it ('calls `dropTable` on the query interface', async () => {
            const tableName = TestHelpers.Faker.Text.randomString(10);
            await migrator.dropTable(tableName);
            expect(MockQueryInterface.dropTable).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.dropTable).toHaveBeenCalledWith(tableName);
        });
    });


    describe('Migrator#addColumn', () => {
        it ('calls `addColumn` on the query interface', async () => {
            const tableName  = TestHelpers.Faker.Text.randomString(10);
            const columnName = TestHelpers.Faker.Text.randomString(10);
            const details   = {
                [TestHelpers.Faker.Text.randomString(10)]: Math.random(),
            };
          
            await migrator.addColumn(tableName, columnName, details);
            expect(MockQueryInterface.addColumn).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.addColumn).toHaveBeenCalledWith(tableName, columnName, details);
        });
    });


    describe('Migrator#removeColumn', () => {
        it ('calls `removeColumn` on the query interface', async () => {
            const tableName  = TestHelpers.Faker.Text.randomString(10);
            const columnName = TestHelpers.Faker.Text.randomString(10);
            await migrator.removeColumn(tableName, columnName);
            expect(MockQueryInterface.removeColumn).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.removeColumn).toHaveBeenCalledWith(tableName, columnName);
        });
    });


    describe('Migrator#addIndex', () => {
        const tableName  = TestHelpers.Faker.Text.randomString(10);
        const fields     = [
            TestHelpers.Faker.Text.randomString(10),
            TestHelpers.Faker.Text.randomString(10)
        ];

        it ('calls `addColumn` on the query interface', async () => {
            const options          = {concurrently: true, unique: true, where: {}, name: 'foo'};
            const expectedOptions  = structuredClone(options);
            expectedOptions.fields = fields; 
          
            await migrator.addIndex(tableName, fields, options);

            expect(MockQueryInterface.addIndex).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.addIndex).toHaveBeenCalledWith(tableName, expectedOptions);
        });


        it ('does not pass unset options', async () => {
            const options          = {};
            const expectedOptions  = {fields: fields};
          
            await migrator.addIndex(tableName, fields, options);

            expect(MockQueryInterface.addIndex).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.addIndex).toHaveBeenCalledWith(tableName, expectedOptions);
        });


        it ('does not pass false or null options', async () => {
            const options          = {concurrently: false, unique: false, where: null, name: null};
            const expectedOptions  = {fields: fields};
          
            await migrator.addIndex(tableName, fields, options);

            expect(MockQueryInterface.addIndex).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.addIndex).toHaveBeenCalledWith(tableName, expectedOptions);
        });
    });


    describe('Migrator#removeIndex', () => {
        it ('calls `removeIndex` on the query interface', async () => {
            const tableName = TestHelpers.Faker.Text.randomString(10);
            const fields     = [
                TestHelpers.Faker.Text.randomString(10),
                TestHelpers.Faker.Text.randomString(10)
            ];

            await migrator.removeIndex(tableName, fields);
            expect(MockQueryInterface.removeIndex).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.removeIndex).toHaveBeenCalledWith(tableName, fields, {});
        });

        it ('sets `concurrently` when set to true', async () => {
            const tableName = TestHelpers.Faker.Text.randomString(10);
            const fields     = [
                TestHelpers.Faker.Text.randomString(10),
                TestHelpers.Faker.Text.randomString(10)
            ];

            await migrator.removeIndex(tableName, fields, true);
            expect(MockQueryInterface.removeIndex).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.removeIndex).toHaveBeenCalledWith(tableName, fields, {concurrently: true});
        });
    });


    describe('Migrator#renameColumn', () => {
        it ('calls `renameColumn` on the query interface', async () => {
            const tableName = TestHelpers.Faker.Text.randomString(10);
            const oldName   = TestHelpers.Faker.Text.randomString(10);
            const newName   = TestHelpers.Faker.Text.randomString(10).toLowerCase();

            await migrator.renameColumn(tableName, oldName, newName);
            expect(MockQueryInterface.renameColumn).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.renameColumn).toHaveBeenCalledWith(tableName, oldName, newName);
        });

        it ('ensures the columns are snake cased', async () => {
            const tableName = TestHelpers.Faker.Text.randomString(10);
            const oldName   = TestHelpers.Faker.Text.randomString(10);
            const newName   = 'myColumn';

            await migrator.renameColumn(tableName, oldName, newName);
            expect(MockQueryInterface.renameColumn).toHaveBeenCalledWith(tableName, oldName, 'my_column');
        });
    });


    describe('Migrator#changeColumn', () => {
        it ('calls `changeColumn` on the query interface', async () => {
            const tableName = TestHelpers.Faker.Text.randomString(10);
            const colName   = TestHelpers.Faker.Text.randomString(10);
            const options   = {
                [TestHelpers.Faker.Text.randomString(10)]: Math.random(),
            };

            await migrator.changeColumn(tableName, colName, options);
            expect(MockQueryInterface.changeColumn).toHaveBeenCalledTimes(1);
            expect(MockQueryInterface.changeColumn).toHaveBeenCalledWith(tableName, colName, options);
        });
    });
});
