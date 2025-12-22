module.exports = {
    "migration_versions": {
        "version": {
            "type": "VARCHAR(255)",
            "allowNull": true,
            "primaryKey": true,
            "unique": true
        },
        "created_at": {
            "type": "DATETIME",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "updated_at": {
            "type": "DATETIME",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        }
    },
    "mats": {
        "id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": true,
            "unique": true
        },
        "name": {
            "type": "VARCHAR(255)",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "judge_count": {
            "type": "INTEGER",
            "allowNull": false,
            "defaultValue": "1",
            "primaryKey": false,
            "unique": false
        },
        "code": {
            "type": "VARCHAR(255)",
            "allowNull": false,
            "primaryKey": false,
            "unique": true
        },
        "created_at": {
            "type": "DATETIME",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "updated_at": {
            "type": "DATETIME",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        }
    }
};