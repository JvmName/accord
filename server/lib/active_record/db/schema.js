const { Connection }              = require('./connection');
const { ConnectionConfiguration } = require('./connectionConfiguration');
const   fs                        = require('node:fs');
const   importSchema              = require('./importSchema');
const { logger }                  = require('../../logger');
const { Sequelize }               = require('sequelize');
const   utils                     = require('../utils');

async function generateActiveRecordSchemaFiles() {
    utils.ensureSchemasDirectory();

    const databaseIds = ConnectionConfiguration.configuredDatabaseIds();
    for (const databaseId of databaseIds) {
        await generateSchemaFilesForDatabase(databaseId);
    }
};


async function generateSchemaFilesForDatabase(databaseId) {
    Connection.clearConnectionsCache();
    const connection     = new Connection(databaseId, {loggingEnabled: false});
    const queryInterface = connection.queryInterface;
    const tables         = await queryInterface.allTables();

    const filePath = filePathForSchemaFile(databaseId);
    const schemas  = `module.exports = ${JSON.stringify(tables, null, 4)};`;

    fs.writeFile(filePath, schemas, err => {
        if (err) {
            logger.error(`Unable to write new schema file to ${filePath}`);
        } else {
            logger.info(`New schemas file written to ${filePath}`); 
        }
    });
}


function getActiveRecordSchema(tableName, databaseId, dialect) {
    const filePath = filePathForSchemaFile(databaseId);
    const schema   = importSchema(filePath, tableName);
    if (!schema) throw new Error(`No schema found for table ${databaseId}.${tableName}`);

    cleanSchema(schema, dialect);

    return schema;
}


function cleanSchema(schema, dialect) {
    for (const [col, details] of Object.entries(schema)) {
        const dataType = dataTypeForColumn(details, dialect);
        if (dataType) details.type = dataType;
        resolveAutoIncrementColumns(details);
        resolveUUIDColumns(details);
    }
}

function resolveAutoIncrementColumns(details) {
    if (!details.defaultValue) return;

    const regExp = /^nextval\(\w+_seq::regclass\)$/;
    if (details.defaultValue.match(regExp)) {
        delete details.defaultValue;
        delete details.allowNull;
        details.autoIncrement = true;
    }
}


function dataTypeForColumn(details, dialect) {
    const typeStr         = details.type.replace(/\(.*\)/, '').toUpperCase();
    const typesForDialect = Object.values(Sequelize.DataTypes).filter(val => val.types && val.types[dialect]);
    for (const dataType of typesForDialect) {
        if (dataType.key == typeStr) return dataType;
        let typeStrs            = dataType.types[dialect];
        if (!typeStrs) typeStrs = [];
        if (!Array.isArray(typeStrs)) {
            typeStrs = Object.values(typeStrs).map(map => Object.values(map)).flat();
        }
        typeStrs = typeStrs.filter(Boolean);
        typeStrs = typeStrs.map(aTypeStr => aTypeStr.toUpperCase());
        if (typeStrs.includes(typeStr)) return Sequelize.DataTypes[dataType.key];
    }

    const typesByDialect  = Object.values(Sequelize.DataTypes[dialect]);
    for (const dataType of typesByDialect) {
        if (dataType.key == typeStr) return dataType;
        try {
            const aTypeStr = dataType.prototype.toSql().replace(/\(.*\)/, '').toUpperCase();
            if (aTypeStr == typeStr) return Sequelize.DataTypes[dataType.key];
        } catch(err) {}
    }

    if (typeStr.includes('CHAR')) return Sequelize.DataTypes.STRING;
}


function resolveUUIDColumns(details) {
    if (details.type != 'UUID' || !details.primaryKey) return;
    details.defaultValue = Sequelize.UUIDV4;
}


function filePathForSchemaFile(databaseId) {
    return `${utils.schemasDirectory}/${databaseId}.js`;
}


module.exports = {
    generateActiveRecordSchemaFiles,
    getActiveRecordSchema
};
