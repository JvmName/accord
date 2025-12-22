const { Connection }    = require('./connection');
const   utils           = require('../utils');
const { Sequelize, Op } = require('sequelize');
const { underscore }    = require('inflection');


class Migrator {
    #connection;
    #fileName;
    #migrationModule;

    DataTypes = Sequelize.DataTypes;
    Operators = Op;


    constructor(fileName, databaseId) {
        this.#connection = new Connection(databaseId);
        this.#fileName   = fileName;
    }


    async run() {
        if (!this.migrationModule.up) throw new Error('Missing migration `up`');

        const migrator = this;
        await this.#connection.queryInterface.transaction(async () => {
            await migrator.migrationModule.up.call(migrator);
        });
    }


    async rollback() {
        if (!this.migrationModule.down) return;

        const migrator = this;
        await this.#connection.queryInterface.transaction(async () => {
            await migrator.migrationModule.down.call(migrator);
        });
    }


    static async runMigration({ fileName, databaseId }) {
        await (new Migrator(fileName, databaseId).run());
    }


    static async rollbackMigration({ fileName, databaseId }) {
        await (new Migrator(fileName, databaseId).rollback());
    }


    get migrationModule() {
        if (!this.#migrationModule) {
            this.#migrationModule = this.importMigrationModule();
        }

        return {...this.#migrationModule};
    }


    importMigrationModule() {
        const filePath = `${utils.migrationsDirectory}/${this.#fileName}`;
        return require(filePath);
    }


    /***********************************************************************************************
    * MIGRATION ACTIONS
    ***********************************************************************************************/
    async createTable(tableName, details, options={}) {
        details = {...this.defaultIdColumn, ...details};
        if (options.timestamps !== false) {
            details = {...details, ...this.defaultTimestampColumns};
        }

        details = this.normalizeTableDetails(details);
        await this.#sequelizeQueryInterface.createTable(tableName, details);
    }


    normalizeTableDetails(details) {
        const normalized = {};

        for (const [colName, colDetails] of Object.entries(details)) {
            const snakedColName = underscore(colName);
            normalized[snakedColName] = colDetails;
        }

        return normalized;
    }


    get defaultIdColumn() {
        return {
          id: {
            allowNull:     false,
            primaryKey:    true,
            type:          this.DataTypes.UUID, }
        };
    }


    get defaultTimestampColumns() {
        return {
            created_at: {
                allowNull: false,
                type: this.DataTypes.DATE },
            updated_at: {
                allowNull: false,
                type: this.DataTypes.DATE }
        };
    }


    async dropTable(tableName) {
        await this.#sequelizeQueryInterface.dropTable(tableName);
    }


    async addColumn(tableName, columnName, columnDetails) {
        await this.#sequelizeQueryInterface.addColumn(tableName, columnName, columnDetails);
    }


    async removeColumn(tableName, columnName) {
        await this.#sequelizeQueryInterface.removeColumn(tableName, columnName);
    }


    async addIndex(tableName, fields, { concurrently, unique, name, where }) {
        const options = {fields: fields};
        if (concurrently) options.concurrently = true;
        if (unique)       options.unique       = true;
        if (name)         options.name         = name;
        if (where)        options.where        = where;

        await this.#sequelizeQueryInterface.addIndex(tableName, options);
    }


    async removeIndex(tableName, indexNameOrAttributes, concurrently=false) {
        const options = {};
        if (concurrently) options.concurrently = true;
        await this.#sequelizeQueryInterface.removeIndex(tableName, indexNameOrAttributes, options);
    }


    async renameColumn(tableName, oldName, newName) {
        newName = underscore(newName);
        await this.#sequelizeQueryInterface.renameColumn(tableName, oldName, newName);
    }


    async changeColumn(tableName, columnName, dataTypeOrOptions) {
        await this.#sequelizeQueryInterface.changeColumn(tableName, columnName, dataTypeOrOptions);
    }


    get #sequelizeQueryInterface() {
        return this.#connection._sequelize.getQueryInterface();
    }
}



module.exports = {
    Migrator
};
