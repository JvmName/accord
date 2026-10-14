const { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, mock, spyOn, test } = require('bun:test');
// bun's `mock.module()` does not hoist above requires the way `jest.mock()`
// does, so it must be declared before the module under test is required.
mock.module(require.resolve('sequelize'), () => {
    class MockSequelize {
        constructor(_1, _2, _3, options) {
            this.options = options;
        }

        transaction = jest.fn(callback => callback())
        close       = jest.fn();
    }
    return {Sequelize: MockSequelize};
});


const { Connection }              = require('../../../lib/activeRecord/db/connection');
const { ConnectionConfiguration } = require('../../../lib/activeRecord/db/connectionConfiguration');
const   CONSTANTS                 = require('../../../lib/constants');
const   TestHelpers               = require('../../helpers');


let spy;
const origLogLevel = CONSTANTS.LOG_LEVEL;
afterEach(() => {
    if (spy) spy.mockRestore();
    spy = null;
    Connection.clearConnectionsCache();
    CONSTANTS.LOG_LEVEL = origLogLevel;
});


const config1 = {
    database: TestHelpers.Faker.Text.randomString(10),
    host:     TestHelpers.Faker.Text.randomString(10),
    password: TestHelpers.Faker.Text.randomString(10),
    port:     Math.random(),
    username: TestHelpers.Faker.Text.randomString(10),
    pool:     {
        min: Math.random(),
        max: Math.random(),
    }
}

const config2 = {
    database: TestHelpers.Faker.Text.randomString(10),
    host:     TestHelpers.Faker.Text.randomString(10),
    password: TestHelpers.Faker.Text.randomString(10),
    port:     Math.random(),
    username: TestHelpers.Faker.Text.randomString(10)
}

const config3 = {
    database: TestHelpers.Faker.Text.randomString(10),
    host:     TestHelpers.Faker.Text.randomString(10),
    password: TestHelpers.Faker.Text.randomString(10),
    port:     Math.random(),
    ssl:      true,
    username: TestHelpers.Faker.Text.randomString(10)
}

const sqliteConfig = {
    dialect: 'sqlite'
};

const databaseId1 = TestHelpers.Faker.Text.randomString(10);
const databaseId2 = TestHelpers.Faker.Text.randomString(10);


describe('Connection', () => {
    beforeEach(() => {
        spy = jest.spyOn(ConnectionConfiguration, '_fetchAllConfigs');
        spy.mockImplementation(() => ({
            default:       {test: config1, development: config1, production: config1},
            [databaseId1]: {test: config2, production: {}},
            [databaseId2]: {test: config3, production: {}},
            sqlite:        {test: sqliteConfig}
        }));
    });

    describe('Connection#_sequelize', () => {
        it ('caches the connection to the same database', () => {
            const conn1 = new Connection();
            const conn2 = new Connection();
            expect(conn1._sequelize).toBe(conn2._sequelize);
        });

        it ('does not cache connections to different databases', () => {
            const conn1 = new Connection();
            const conn2 = new Connection(databaseId1);
            expect(conn1._sequelize).not.toBe(conn2._sequelize);
        });

        describe('settings (general)', () => {
            it ('enables logging when log level is debug', () => {
                CONSTANTS.LOG_LEVEL = 'debug';
                process.env.LOG_SQL = 1;
                const conn = new Connection();
                expect(conn._sequelize.options.logging).toEqual(expect.any(Function))
            });

            it ('does not enable logging when log level is not debug', () => {
                CONSTANTS.LOG_LEVEL = 'info';
                process.env.LOG_SQL = undefined;
                const conn = new Connection();
                expect(conn._sequelize.options.logging).toBeFalsy();
            });

            it ('configures the connection to use underscores for columns', () => {
                const conn = new Connection();
                expect(conn._sequelize.options.define.underscored).toBeTruthy();
            });
        });


        describe('settings (sqlite)', () => {
            it ('sets the connection settings to the correct values for sqlite', () => {
                const conn = new Connection('sqlite');
                expect(conn._sequelize.options.dialect).toEqual('sqlite');
                expect(conn._sequelize.options.storage).toEqual(`${process.cwd()}/config/db/database.test.sqlite`);
            });
        });
    });


    describe('Connection#close', () => {
        it ('calls close on the underlying sequelize connection', () => {
            const conn = new Connection();
            conn._sequelize; // reference it to initiate the connection
            conn.close();
            expect(conn._sequelize.close).toHaveBeenCalledTimes(1);
        });
    });


    describe('Connection.closeAll', () => {
        it ('calls close on all cached connections', () => {
            const conn1 = new Connection();
            const conn2 = new Connection(databaseId1);
            conn1._sequelize // reference it to initiate the connection
            conn2._sequelize // reference it to initiate the connection
            Connection.closeAll();
            expect(conn1._sequelize.close).toHaveBeenCalledTimes(1);
            expect(conn2._sequelize.close).toHaveBeenCalledTimes(1);
        });
    });
});
