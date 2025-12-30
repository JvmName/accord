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
    },
    "mat_codes": {
        "id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": true,
            "unique": true
        },
        "mat_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": true
        },
        "code": {
            "type": "VARCHAR(255)",
            "allowNull": false,
            "primaryKey": false,
            "unique": true
        },
        "role": {
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
    "matches": {
        "id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": true,
            "unique": true
        },
        "creator_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "mat_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "red_competitor_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "blue_competitor_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "red_score": {
            "type": "INTEGER",
            "allowNull": false,
            "defaultValue": "0",
            "primaryKey": false,
            "unique": false
        },
        "blue_score": {
            "type": "INTEGER",
            "allowNull": false,
            "defaultValue": "0",
            "primaryKey": false,
            "unique": false
        },
        "started_at": {
            "type": "DATETIME",
            "allowNull": true,
            "primaryKey": false,
            "unique": false
        },
        "ended_at": {
            "type": "DATETIME",
            "allowNull": true,
            "primaryKey": false,
            "unique": false
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
    "riding_time_votes": {
        "id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": true,
            "unique": true
        },
        "round_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "judge_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "competitor_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "ended_at": {
            "type": "DATETIME",
            "allowNull": true,
            "primaryKey": false,
            "unique": false
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
    "rounds": {
        "id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": true,
            "unique": true
        },
        "match_id": {
            "type": "UUID",
            "allowNull": false,
            "primaryKey": false,
            "unique": false
        },
        "submission_by": {
            "type": "UUID",
            "allowNull": true,
            "primaryKey": false,
            "unique": false
        },
        "submission": {
            "type": "VARCHAR(255)",
            "allowNull": true,
            "primaryKey": false,
            "unique": false
        },
        "ended_at": {
            "type": "DATETIME",
            "allowNull": true,
            "primaryKey": false,
            "unique": false
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