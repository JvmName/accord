const { Connection, DEFAULT_DATABASE_ID } = require('./db/connection');
const { getActiveRecordSchema }           = require('./db/schema');
const { Model, Op }                       = require('sequelize');
const { tableize, underscore }            = require('inflection');
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
    * ASSOCIATIONS
    ***********************************************************************************************/
    static belongsTo(model, options={}) {
        options.onDelete = 'NO ACTION';
        options.onUpdate = 'NO ACTION';
        super.belongsTo(model, options);
    }


    static belongsToMany(model, options) {
        options.onDelete = 'NO ACTION';
        options.onUpdate = 'NO ACTION';

        let tableName;
        if (typeof options.through == 'string') {
            tableName       = options.through;
            options.through = {};
        } else if (options.through.tableName) {
            tableName = options.through.tableName;
            delete options.through.tableName;
        }

        if (tableName) {
            const schema     = getActiveRecordSchema(tableName, this.databaseId, this.connection.dialect);
            const foreignKey = options.foreignKey || `${underscore(this.name)}_id`;
            const otherKey   = options.otherKey   || `${underscore(model.name)}_id`;

            delete schema[foreignKey];
            delete schema[otherKey];
            delete schema.updated_at;
            delete schema.created_at;

            options.through.model = this.connection._sequelize.define(tableName, schema);
        }

        super.belongsToMany(model, options);
    }


    /***********************************************************************************************
    * MISC
    ***********************************************************************************************/
    [nodeUtil.inspect.custom](opts) {
        const args = Array.from(arguments);
        args.shift();
        return nodeUtil.inspect(this.dataValues, ...args);
    }


    get apiSafeKeys() {
        const keys = Object.keys(this.rawAttributes).filter(key => {
            return !['created_at', 'updated_at', 'mats_users'].includes(key);
        });

        return keys;
    }


    toApiResponse() {
        const response = {};
        for (const key of this.apiSafeKeys) {
            response[key] = this.dataValues[key] || null;
        }
        return response;
    }
}


module.exports = {
    BaseRecord
};
