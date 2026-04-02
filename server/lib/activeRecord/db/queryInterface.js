const { Op }  = require('sequelize');

class QueryInterface {
    #connection;

    Operators = Op;

    constructor(connection) {
        this.#connection = connection;
    }


    async allTables() {
        const queryInterface = this.#sequelizeQueryInterface;
        const tableNames     = await queryInterface.showAllTables()
        const tables         = {};

        for (const tableName of tableNames) {
            const table      = await (queryInterface.describeTable(tableName));
            tables[tableName] = table;
        }

        return tables;
    }


    async transaction(callback) {
        await this.#sequelize.transaction(callback); 
    }



    get #sequelizeQueryInterface() {
        return this.#sequelize.getQueryInterface();
    }


    get #sequelize() {
        return this.#connection._sequelize;
    }

}


module.exports = {
    QueryInterface
}
