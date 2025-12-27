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
    "users": {
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
        "email": {
            "type": "VARCHAR(255)",
            "allowNull": false,
            "primaryKey": false,
            "unique": true
        },
        "api_token": {
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
        },
        "creator_id": {
            "type": "UUID",
            "allowNull": true,
            "primaryKey": false,
            "unique": false
        }
    },
    "judges_mats": {
        "mat_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": true
        },
        "user_id": {
            "type": "UUID",
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
    },
    "mats_viewers": {
        "mat_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": true
        },
        "user_id": {
            "type": "UUID",
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