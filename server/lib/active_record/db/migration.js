const { Connection }                      = require('./connection');
const   fs                                = require('node:fs');
const { generateActiveRecordSchemaFiles } = require('./schema');
const { logger }                          = require('../../logger');
const { Migrator }                        = require('./migrator');
const   utils                             = require('../utils');
const versioning                          = require('./migrationVersion');


/***********************************************************************************************
* MIGRATION UP
***********************************************************************************************/
async function runMigrations() {
    const migrations = await migrationsToRun();
    for (const migration of migrations) {
        await runMigration(migration);
    }

    await generateActiveRecordSchemaFiles();

    Connection.closeAll();
}


async function runMigration(migration) {
    const migrationStr = migration.fileName.replace(/\.js$/, '');
    logger.info(`Running migration ${migrationStr}`);

    await Migrator.runMigration(migration);

    await versioning.markVersionAsPerformed(migration);
    logger.info(`Completed migration ${migrationStr}`);
}


async function migrationsToRun() {
    const allMigrations   = getMigrations();
    const migrationsToRun = [];

    for (const migration of allMigrations) {
        if (await versioning.migrationHasRun(migration)) continue;
        migrationsToRun.push(migration);
    }

    return migrationsToRun;
}


/***********************************************************************************************
* MIGRATION DOWN
***********************************************************************************************/
async function rollbackMigration() {
    const migration = await migrationToRollback();
    if (!migration) {
        logger.info(`No migration to rollback`);
    } else {
        const migrationStr = migration.fileName.replace(/\.js$/, '');
        logger.info(`Rolling back migration ${migrationStr}`);

        await Migrator.rollbackMigration(migration);

        await versioning.markVersionAsNotPerformed(migration);
        logger.info(`Rolled back migration ${migrationStr}`);
    }

    await generateActiveRecordSchemaFiles();

    Connection.closeAll();
}


async function migrationToRollback() {
    const allMigrations   = getMigrations().reverse();

    for (const migration of allMigrations) {
        if (await versioning.migrationHasRun(migration)) return migration;
    }

    return null;
}


/***********************************************************************************************
* MIGRATION CREATION
***********************************************************************************************/
function generateMigrationFile(description, databaseId) {
    utils.ensureMigrationsDirectory();

    description    = utils.toCamelCase(description);
    const fileName = fileNameForMigration(description, databaseId);
    const filePath = `${utils.migrationsDirectory}/${fileName}`;   
    const template = require('./migrationTemplate');
    fs.writeFile(filePath, template, err => {
        if (err) {
            logger.error(`Unable to write new migration file to ${filePath}`);
        } else {
            logger.info(`New migration file written to ${filePath}`); 
        }
    });
}


function fileNameForMigration(description, databaseId) {
    const name     = `${description}_${new Date().getTime()}`;
    const dbSuffix = databaseId ? `.${databaseId}` : '';
    return `${name}${dbSuffix}.js`;
}


/***********************************************************************************************
* UTILS
***********************************************************************************************/
function getMigrations() {
    const files = fs.readdirSync(utils.migrationsDirectory);
    const migrations = files.map(f => {
        const m = f.match(/_(?<version>\d+)(\.(?<databaseId>\w+))?\.js$/);
        if (!m) return;
        return {fileName: f, databaseId: m.groups.databaseId, version: m.groups.version};
    });

    return migrations.filter(item => item)
                      .sort((m1, m2) => {
                          return parseInt(m1.version) - parseInt(m2.version);
                      });
}


module.exports = {
    generateMigrationFile,
    rollbackMigration,
    runMigrations
}
