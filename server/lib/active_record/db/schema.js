const { Connection }              = require('./connection');
const { ConnectionConfiguration } = require('./connectionConfiguration');
const   fs                        = require('node:fs');
const { logger }                  = require('../../logger');
const { Sequelize }               = require('sequelize');
const   utils                     = require('../utils');

const ALL_TYPES = Object.values(Sequelize.DataTypes).filter(dataType => dataType.types);

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
    const schemas  = require(filePath);
    const schema   = schemas[tableName];
    cleanSchema(schema, dialect);

    if (!schema) throw new Error(`No schema found for table ${databaseId}.${tableName}`);

    return schema;
}

function cleanSchema(schema, dialect) {
    for (const [col, details] of Object.entries(schema)) {
        details.type = dataTypeForColumn(details, dialect);
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
    const typeStr         = details.type.replace(/\(.*\)/, '');
    const dataType = ALL_TYPES.find(dataType => {
        return dataType.types[dialect] && dataType.types[dialect].includes(typeStr);
    });
    return dataType;
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
