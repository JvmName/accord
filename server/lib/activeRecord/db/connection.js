const { ConnectionConfiguration } = require('./connectionConfiguration');
const { logger }                  = require('../../logger');
const { QueryInterface }          = require('./queryInterface');
const { Sequelize }               = require('sequelize');
// Side effect: Sequelize DATE stores ISO 8601 text. Must load before the first
// `new Sequelize` (FINDINGS F-39). Delete with the Sequelize layer (task 15).
require('./isoDateTime');


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
            ...this.dialectOptions,
            define:  { underscored: true },
            dialect: this.dialect,
            logging: (sql) => logger.debug(sql)
        };

        if (!this.loggingEnabled) options.logging = false;

        return options;
    }


    get dialectOptions() {
        return this.sqliteSequelizeOptions;
    }


    get sqliteSequelizeOptions() {
        return {
            storage: this.#configuration.storage
        };
    }


    get loggingEnabled() {
        if (this.#options.hasOwnProperty('loggingEnabled')) {
            return this.#options.loggingEnabled;
        }
        return this.#configuration.loggingEnabled;
    }


    get dialect() {
        return this.#configuration.dialect;
    }
}


module.exports = {
    Connection,
    DEFAULT_DATABASE_ID
}
