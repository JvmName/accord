const { Connection } = require('./connection');
const { DataTypes }  = require('sequelize');


const performedVersions = {};
const models      = {};


async function migrationHasRun({ version, databaseId }) {
    const performedVersions = await performedVersionsForDatabase(databaseId);
    return performedVersions.has(version)
}


async function markVersionAsPerformed({ version, databaseId }) {
    const model = await versionModelForDatabase(databaseId);
    await model.create({ version });
}


async function markVersionAsNotPerformed({ version, databaseId }) {
    const model = await versionModelForDatabase(databaseId);
    await model.destroy({where: { version }});
}


async function performedVersionsForDatabase(databaseId) {
    if (performedVersions[databaseId]) return performedVersions[databaseId];

    const model                   = await versionModelForDatabase(databaseId);
    const records                 = await model.findAll()
    const versions                = new Set(records.map(({ version }) => version));
    performedVersions[databaseId] = versions;

    return performedVersions[databaseId];
}


async function versionModelForDatabase(databaseId) {
    if (models[databaseId]) return models[databaseId];

    const model        = createVersionModelForDatabase(databaseId);
    models[databaseId] = model;
    await model.sync();

    return model;
};


function createVersionModelForDatabase(databaseId) {
    const connection = new Connection(databaseId);
    return connection._sequelize.define('MigrationVersion', {
        version: {
            type:       DataTypes.STRING,
            primaryKey: true
        }

    }, {
        tableName: 'migration_versions'
    });
}


module.exports = {
    markVersionAsNotPerformed,
    markVersionAsPerformed,
    migrationHasRun
};
