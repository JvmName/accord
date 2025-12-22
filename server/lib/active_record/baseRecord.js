const { Connection, DEFAULT_DATABASE_ID } = require('./db/connection');
const { getActiveRecordSchema }           = require('./db/schema');
const { Model, Op }                       = require('sequelize');
const { tableize }                        = require('inflection');
const   utils                             = require('./utils');
const   nodeUtil                          = require('util');



class BaseRecord extends Model {
    static _connection;
    static _initialized = false;


    static Operators = Op;
    static get fn()  { return this.connection._sequelize.fn }
    static get col() { return this.connection._sequelize.col }


    constructor() {
        if (new.target == BaseRecord) throw new Error("BaseRecord must be subclasses");
        super(...arguments);
    }


    /***********************************************************************************************
    * QUERIES
    ***********************************************************************************************/
    static async find(id) {
        return await this.findByPk(id);
    }


    static async where(where, options={}) {
        const parameters = {...options, where };
        return await this.findAll(parameters);
    }


    /***********************************************************************************************
    * INITIALIZATION
    ***********************************************************************************************/
    static initialize() {
        if (this == BaseRecord) throw new Error("BaseRecord must be subclasses");

        if (this._initialized) return;

        const schema  = getActiveRecordSchema(this._tableName, this.databaseId, this.connection.dialect);
        const options = {
            createdAt: 'created_at',
            deletedAt: 'deleted_at',
            modelName: this.name,
            sequelize: this.connection._sequelize,
            tableName: this._tableName,
            updatedAt: 'updated_at',
        }

        if (!schema.created_at || !schema.updated_at) {
            options.timestamps = false;
        }

        this.init(schema, options);

        this._initialized = true;
    }


    /***********************************************************************************************
    * DB CONNECTION
    ***********************************************************************************************/
    static get connection() {
        if (!this._connection) {
            this._connection = new Connection(this.constructor.databaseId);
        }
        return this._connection;
    }


    static get databaseId() {
        return DEFAULT_DATABASE_ID;
    }


    static get _tableName() {
        return tableize(this.name);
    }


    static closeConnection() {
        this.connection.close();
    }


    static closeAllConnections() {
        Connection.closeAll();
    }


    /***********************************************************************************************
    * MISC
    ***********************************************************************************************/
    [nodeUtil.inspect.custom](opts) {
        const args = Array.from(arguments);
        args.shift();
        return nodeUtil.inspect(this.dataValues, ...args);
    }
}


module.exports = {
    BaseRecord
};
