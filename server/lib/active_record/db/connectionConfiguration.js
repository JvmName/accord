const utils = require('../utils');


class ConnectionConfiguration {
    #_config;
    #databaseId;

    constructor(databaseId) {
        this.#databaseId = databaseId;
        this.#validateConfiguration();
    }


    get databaseId()     { return this.#databaseId };

    get database()       { return this.#config.database };
    get host()           { return this.#config.host };
    get password()       { return this.#config.password };
    get port()           { return this.#config.port || 5432 };
    get username()       { return this.#config.username };
    get ssl()            { return Boolean(this.#config.ssl) };

    get readers()        { return this.#config.readers || [] };

    get pool()           { return {min: this.#poolMin, max: this.#poolMax}}
    get #poolMin()       { return this.#config.pool?.min || 0 }
    get #poolMax()       { return this.#config.pool?.max || 5 }

    get loggingEnabled() { return this.env == 'development' };


    #validateConfiguration() {
        const keys   = ['database', 'host', 'password', 'username'];
        const config = this.#config;
        keys.forEach(key => {
            if (!config[key]) throw new Error(`Missing ${key} for database configuration ${this.#configId}`);
        });
    }

 
    get #configId() {
        return `${this.#databaseId}.${this.env}`;
    }


    get #config() {
        if (this.#_config) return this.#_config[this.env];

        if (!this._allConfigs) throw new Error(`Missing database configuration`);

        const config = this._allConfigs[this.#databaseId];
        if (!config || !config[this.env]) throw new Error(`Missing database configuration for ${this.#configId}`);

        this.#_config = config;
        return this.#_config[this.env];
    }


    /***********************************************************************************************
    * "ALL" CONFIGS 
    ***********************************************************************************************/
    static get _allConfigs() {
        return structuredClone(this._fetchAllConfigs());
    }


    static _fetchAllConfigs() {
        try {
            return require(this.configFilePath);
        } catch(err) {
            throw new Error(`Missing or invalid ${this.configFilePath}`);
        }
    }


    static get configFilePath() {
        return `${utils.configDirectory}/config.js`;
    }


    static get env() {
        return process.env.NODE_ENV || 'development';
    }


    get _allConfigs()    { return this.constructor._allConfigs; }
    get configFilePath() { return this.constructor.configFilePath; }
    get env()            { return this.constructor.env; }


    static configuredDatabaseIds() {
        const databaseIds = [];

        for (const [databaseId, config] of Object.entries(this._allConfigs)) {
            if (config[this.env]) databaseIds.push(databaseId);
        }

        return databaseIds
    }
}


module.exports = {
    ConnectionConfiguration
};
