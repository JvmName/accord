const { QueryInterface }          = require('./queryInterface');
const { ConnectionConfiguration } = require('./connectionConfiguration');
const { Sequelize }               = require('sequelize');


let   sequelizeConnectionsCache = {};
const DEFAULT_DATABASE_ID       = 'default';


class Connection {
    #configuration;
    #databaseId;
    #options;

    constructor(databaseId, options={}) {
        this.#databaseId    = databaseId || DEFAULT_DATABASE_ID;
        this.#configuration = new ConnectionConfiguration(this.#databaseId);
        this.#options       = options;
    }


    close() {
        this._sequelize.close();
    }


    static closeAll() {
        Object.values(sequelizeConnectionsCache).forEach(sequelize => {
            sequelize.close();
        });
    }


    static clearConnectionsCache() {
        this.closeAll();
        sequelizeConnectionsCache = {};
    }


    get queryInterface() {
        return new QueryInterface(this);
    }


    get _sequelize() {
        if (sequelizeConnectionsCache[this.#databaseId]) return sequelizeConnectionsCache[this.#databaseId];

        const connection = new Sequelize(null, null, null, this.sequelizeOptions);
        sequelizeConnectionsCache[this.#databaseId] = connection;

        return connection;
    }


    get sequelizeOptions() {
        const options = {
            define:  { underscored: true },
            dialect: this.dialect,
            pool:    this.#configuration.pool,
        };

        const primaryConfig = {
            database: this.#configuration.database,
            host:     this.#configuration.host,
            password: this.#configuration.password,
            port:     this.#configuration.port,
            username: this.#configuration.username
        };

        if (this.#configuration.readers.length) {
            options.replication = {
                write: primaryConfig,
                read: this.#configuration.readers
            }
        } else {
            Object.assign(options, primaryConfig);
        }

        if (this.#configuration.ssl) options.dialectOptions = {ssl: {require: true}};

        if (!this.loggingEnabled) options.logging = false;

        return options;
    }


    get loggingEnabled() {
        if (this.#options.hasOwnProperty('loggingEnabled')) {
            return this.#options.loggingEnabled;
        }
        return this.#configuration.loggingEnabled;
    }


    get dialect() {
        return 'postgres'
    }
}


module.exports = {
    Connection,
    DEFAULT_DATABASE_ID
}
