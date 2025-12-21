const fs = require('node:fs');


const configDirectory     = `${process.cwd()}/config/db`;
const migrationsDirectory = `${configDirectory}/migrations`;
const schemasDirectory    = `${configDirectory}/schemas`;


function ensureConfigDirectory() {
    fs.mkdirSync(configDirectory, { recursive: true });
}


function ensureMigrationsDirectory() {
    fs.mkdirSync(migrationsDirectory, { recursive: true });
}


function ensureSchemasDirectory() {
    fs.mkdirSync(schemasDirectory, { recursive: true });
}


function toCamelCase(str) {
    return str.split(/[-_\s]/).map((word, index) => {
        if (index === 0) return word.toLowerCase();
        return (
            word.charAt(0).toUpperCase() +
            word.slice(1).toLowerCase()
        );
    }).join("");
}


module.exports = {
    configDirectory,
    ensureConfigDirectory,
    ensureMigrationsDirectory,
    ensureSchemasDirectory,
    migrationsDirectory,
    schemasDirectory,
    toCamelCase
}
