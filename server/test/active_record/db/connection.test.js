const { Connection }              = require('../../../lib/active_record/db/connection');
const { ConnectionConfiguration } = require('../../../lib/active_record/db/connectionConfiguration');
const   TestHelpers               = require('../../helpers');


jest.mock('sequelize', () => {
    class MockSequelize {
        constructor(_1, _2, _3, options) {
            this.options = options;
        }

        transaction = jest.fn(callback => callback())
        close       = jest.fn();
    }
    return {Sequelize: MockSequelize};
});


let spy;
const origEnv = process.env.NODE_ENV;
afterEach(() => {
    if (spy) spy.mockRestore();
    spy = null;
    Connection.clearConnectionsCache();
    process.env.NODE_ENV = origEnv;
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

        describe('settings (postgres)', () => {
            it ('sets the connection settings to the correct values', () => {
                const conn1 = new Connection();
                expect(conn1._sequelize.options.database).toEqual(config1.database);
                expect(conn1._sequelize.options.dialect).toEqual('postgres');
                expect(conn1._sequelize.options.host).toEqual(config1.host);
                expect(conn1._sequelize.options.password).toEqual(config1.password);
                expect(conn1._sequelize.options.port).toEqual(config1.port);
                expect(conn1._sequelize.options.username).toEqual(config1.username);

                const conn2 = new Connection(databaseId1);
                expect(conn2._sequelize.options.database).toEqual(config2.database);
                expect(conn2._sequelize.options.dialect).toEqual('postgres');
                expect(conn2._sequelize.options.host).toEqual(config2.host);
                expect(conn2._sequelize.options.password).toEqual(config2.password);
                expect(conn2._sequelize.options.port).toEqual(config2.port);
                expect(conn2._sequelize.options.username).toEqual(config2.username);
            });

            it ('requires ssl when the configuration says to', () => {
                const conn = new Connection(databaseId2);
                expect(conn._sequelize.options.dialectOptions).toEqual({ssl: {require: true}});
            });

            it ('enables logging in development', () => {
                process.env.NODE_ENV = 'development';
                const conn = new Connection();
                expect(conn._sequelize.options.logging).toBe(undefined); // undefined defaults to true
            });

            it ('does not enable logging in production', () => {
                process.env.NODE_ENV = 'production';
                const conn = new Connection();
                expect(conn._sequelize.options.logging).toBeFalsy();
            });

            it ('sets the connection pool to the configured values', () => {
                const conn1 = new Connection();
                expect(conn1._sequelize.options.pool).toEqual(config1.pool);

                const conn2 = new Connection(databaseId1);
                expect(conn2._sequelize.options.pool).toEqual({min: 0, max: 5})
            });

            it ('configures the connection to use underscores for columns', () => {
                const conn = new Connection();
                expect(conn._sequelize.options.define.underscored).toBeTruthy();
            });


            describe('replication', () => {
                it ('configures a read and writer when replicas are configured', () => {
                    const config = {
                        database: TestHelpers.Faker.Text.randomString(10),
                        host:     TestHelpers.Faker.Text.randomString(10),
                        password: TestHelpers.Faker.Text.randomString(10),
                        port:     Math.random(),
                        username: TestHelpers.Faker.Text.randomString(10),
                        readers: [
                            {
                                database: TestHelpers.Faker.Text.randomString(10),
                                host:     TestHelpers.Faker.Text.randomString(10),
                                password: TestHelpers.Faker.Text.randomString(10),
                                port:     Math.random(),
                                username: TestHelpers.Faker.Text.randomString(10),
                            },
                            {
                                database: TestHelpers.Faker.Text.randomString(10),
                                host:     TestHelpers.Faker.Text.randomString(10),
                                password: TestHelpers.Faker.Text.randomString(10),
                                port:     Math.random(),
                                username: TestHelpers.Faker.Text.randomString(10),
                            },
                        ]
                    }
                    spy.mockImplementation(() => ({default: {test: config }}));
                    const conn    = new Connection();
                    const options = conn._sequelize.options;
                    expect(options.database).toBe(undefined);
                    expect(options.dialect).toBe('postgres');
                    expect(options.host).toBe(undefined);
                    expect(options.password).toBe(undefined);
                    expect(options.port).toBe(undefined);
                    expect(options.username).toBe(undefined);

                    expect(options.replication).toEqual({
                        write: {
                            database: config.database,
                            host:     config.host,
                            password: config.password,
                            port:     config.port,
                            username: config.username,
                        },
                        read: config.readers
                    });
                });
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
