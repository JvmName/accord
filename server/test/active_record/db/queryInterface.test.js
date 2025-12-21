const { Connection }              = require('../../../lib/active_record/db/connection');
const { ConnectionConfiguration } = require('../../../lib/active_record/db/connectionConfiguration');
const { QueryInterface }          = require('../../../lib/active_record/db/queryInterface');
const { Sequelize }               = require('sequelize');
const   TestHelpers               = require('../../helpers');


const tableName1     = TestHelpers.Faker.Text.randomString(10);
const tableName2     = TestHelpers.Faker.Text.randomString(10);
const MockQueryInterface = {
    showAllTables: jest.fn(()          => [tableName1, tableName2]),
    describeTable: jest.fn((tableName) => ({name: tableName}))
}
jest.mock('sequelize', () => {
    class MockSequelize {
        transaction = jest.fn()
    }
    return {Sequelize: MockSequelize};
});

Sequelize.prototype.getQueryInterface = () => MockQueryInterface;


const connectionConfig = {database: ' ', host: ' ', password: ' ', username: ' '};
const configSpy        = jest.spyOn(ConnectionConfiguration, '_fetchAllConfigs');
configSpy.mockImplementation(() => ({default: {test: connectionConfig}}));

const connection     = new Connection();
const queryInterface = new QueryInterface(connection);

afterEach(() => {
    jest.clearAllMocks();
});


describe('QueryInterface', () => {
    describe('QueryInterface#allTables', () => {
        it ('uses the sequelize queryInterface to fetch the list of tables', async () => {
            await queryInterface.allTables();
            expect(MockQueryInterface.showAllTables).toHaveBeenCalledTimes(1);
        });

        it ('uses the sequelize queryInterface to fetch the details of all tables', async () => {
            await queryInterface.allTables();
            expect(MockQueryInterface.describeTable).toHaveBeenCalledTimes(2);
            expect(MockQueryInterface.describeTable).toHaveBeenCalledWith(tableName1);
            expect(MockQueryInterface.describeTable).toHaveBeenCalledWith(tableName2);
        });

        it ('returns the details of all tables', async () => {
            const tables = await queryInterface.allTables();
            expect(tables[tableName1]).toEqual({name: tableName1});
            expect(tables[tableName2]).toEqual({name: tableName2});
        });
    });


    describe('QueryInterface#transaction', () => {
        it ('uses the sequelize queryInterface wrap a callback in a transaction', async () => {
            const callback = jest.fn();
            await queryInterface.transaction(callback);
            expect(connection._sequelize.transaction).toHaveBeenCalledTimes(1);
            expect(connection._sequelize.transaction).toHaveBeenCalledWith(callback);
        });
    });
});
