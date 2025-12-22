const { ConnectionConfiguration } = require('../../../lib/active_record/db/connectionConfiguration');
const   TestHelpers               = require('../../helpers');


const test = {
    database: TestHelpers.Faker.Text.randomString(10),
    host:     TestHelpers.Faker.Text.randomString(10),
    password: TestHelpers.Faker.Text.randomString(10),
    port:     Math.random(),
    username: TestHelpers.Faker.Text.randomString(10)
}
const production = {
    database: TestHelpers.Faker.Text.randomString(10),
    host:     TestHelpers.Faker.Text.randomString(10),
    password: TestHelpers.Faker.Text.randomString(10),
    port:     Math.random(),
    username: TestHelpers.Faker.Text.randomString(10)
}

const sqliteConfig = {
    dialect: 'sqlite'
};

const databaseId1 = TestHelpers.Faker.Text.randomString(10);
const databaseId2 = TestHelpers.Faker.Text.randomString(10);

const origEnvDBPoolMin = process.env.DB_POOL_MIN;
const origEnvDBPoolMax = process.env.DB_POOL_MAX;

const spy = jest.spyOn(ConnectionConfiguration, '_fetchAllConfigs');
afterEach(() => {
    spy.mockReset();
});


describe('ConnectionConfiguration', () => {
    it ('throws an error when there is no configuration for the database id', () => {
        spy.mockImplementation(() => ({ test }));
        expect(() => new ConnectionConfiguration(databaseId1)).toThrow();
    });

    it ('throws an error when there is no configuration for the environment', () => {
        spy.mockImplementation(() => ({[databaseId1]: { production }}));
        expect(() => new ConnectionConfiguration(databaseId1)).toThrow();
    });

    it ('throws an error when there is missing information for postgres', () => {
        spy.mockImplementation(() => ({[databaseId1]: {test: {port: Math.random()}}}));
        expect(() => new ConnectionConfiguration(databaseId1)).toThrow();
    });

    it ('does not require database details for sqlite', () => {
        spy.mockImplementation(() => ({[databaseId1]: {test: sqliteConfig}}));
        expect(() => new ConnectionConfiguration(databaseId1)).not.toThrow();
    });

    it ('returns the correct configuration values', () => {
        spy.mockImplementation(() => {
            return {
                [databaseId1]: { test, production },
                [databaseId2]: { test: {}, production: {} },
            }
        });

        const config = new ConnectionConfiguration(databaseId1);

        expect(config.database).toEqual(test.database);
        expect(config.host).toEqual(test.host);
        expect(config.password).toEqual(test.password);
        expect(config.username).toEqual(test.username);
        expect(config.ssl).toBeFalsy();
    });

    it ('returns the correct configuration values', () => {
        const rawConfig = {...test, ssl: true};
        spy.mockImplementation(() => ({[databaseId1]: { test: rawConfig }}));

        const config = new ConnectionConfiguration(databaseId1);
        expect(config.ssl).toBeTruthy();
    });


    describe('ConnectionConfiguration#loggingEnabled', () => {
        it ('enables logging in development', () => {
            const origEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            spy.mockImplementation(() => ({[databaseId1]: {development: test}}));

            const config = new ConnectionConfiguration(databaseId1);
            expect(config.loggingEnabled).toBeTruthy();

            process.env.NODE_ENV = origEnv;
        });

        it ('does not enable logging in production', () => {
            const origEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            spy.mockImplementation(() => ({[databaseId1]: { production }}));

            const config = new ConnectionConfiguration(databaseId1);
            expect(config.loggingEnabled).toBeFalsy();

            process.env.NODE_ENV = origEnv;
        });
    });


    describe('ConnectionConfiguration#pool', () => {
        afterEach(() => {
            process.env.DB_POOL_MIN = origEnvDBPoolMin;
            process.env.DB_POOL_MAX = origEnvDBPoolMax;
        });

        it ('uses default pool values', () => {
            spy.mockImplementation(() => ({[databaseId1]: {test}}));

            const config = new ConnectionConfiguration(databaseId1);
            expect(config.pool).toEqual({min: 0, max: 5});
        });

        it ('uses config variables when configured', () => {
            const poolMax           = Math.random();
            const poolMin           = Math.random();
            process.env.DB_POOL_MIN = Math.random();
            process.env.DB_POOL_MAX = Math.random();
            const pooledTest        = {...test, pool: {min: poolMin, max: poolMax}};
            spy.mockImplementation(() => ({[databaseId1]: {test: pooledTest}}));

            const config = new ConnectionConfiguration(databaseId1);
            expect(config.pool).toEqual({min: poolMin, max: poolMax});
        });
    });


    describe('ConnectionConfiguration.configuredDatabaseIds', () => {
        it ('returns a list of all configured databaseIds', () => {
            const configs = {
              [databaseId1]: { production, test },
              [databaseId2]: { production, test }
            };

            spy.mockImplementation(() => configs);

            expect(ConnectionConfiguration.configuredDatabaseIds()).toEqual([databaseId1, databaseId2]);
        });

        it ('returns only databaseIds configured for the current environment', () => {
            const configs = {
              [databaseId1]: { production },
              [databaseId2]: { production, test }
            };

            spy.mockImplementation(() => configs);
            expect(ConnectionConfiguration.configuredDatabaseIds()).toEqual([databaseId2]);
        });
    });


    describe('ConnectionConfiguration#dialect', () => {
        it ('defaults to postgres', () => {
            spy.mockImplementation(() => ({[databaseId1]: { test }}));
            const config = new ConnectionConfiguration(databaseId1);
            expect(config.dialect).toEqual('postgres');
        });

        it ('returns sqlite when configured to do so', () => {
            spy.mockImplementation(() => ({[databaseId1]: {test: sqliteConfig}}));
            const config = new ConnectionConfiguration(databaseId1);
            expect(config.dialect).toEqual('sqlite');
        });
    });


    describe('ConnectionConfiguration#storage', () => {
        it ('returns the correct path for sqlite database file', () => {
            spy.mockImplementation(() => ({[databaseId1]: {test: sqliteConfig}}));
            const config   = new ConnectionConfiguration(databaseId1);
            const expected = `${process.cwd()}/config/db/database.test.sqlite`;
            expect(config.storage).toEqual(expected);
        });
    });
});
