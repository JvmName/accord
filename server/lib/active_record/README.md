# Configuration
To configure your database, create a `config.js` file in the `config/db/` directory of your project. That file should follow this format:
```
module.exports = {
    default: {
        development: {
            database: process.env.DATABASE,
            host: process.env.DB_HOST,
            password: process.env.DB_PASSWORD,
            username: process.env.DB_USERNAME
        },
        production: {
            ...
        },
        ...
    }
}
```

Add additional entries for multiple databases
```
module.exports = {
    default: {
        ...
    },
    metrics: {
        development: {
            database: process.env.DATABASE,
            host: process.env.DB_HOST,
            password: process.env.DB_PASSWORD,
            username: process.env.DB_USERNAME
        },
        production: {
            ...
        },
        ...
    },
    ...
}
```


### Connection Pooling
Minimum and maximum connection pool sizes can be configured in config.js, but default to 0 and 5, respectively.
```
development: {
    database: process.env.DATABASE,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    username: process.env.DB_USERNAME,
    pool: {
        min: 1,
        max: 10
    }
}
```


### Replication
Read replicas can be configured by adding a `readers` key to your configuration
```
development: {
    database: process.env.DATABASE,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    username: process.env.DB_USERNAME,
    readers: [
        {
            database: ...
            host: ...
            password: ...
            username: ...
        },
        {
            ...
        }
    }
}
```


# Migrations
To prepare your project to run database migrations, add the following lines to the `scripts` section of your `package.json`:
```
"db:create_migration": "node node_modules/@vida-global/core/scripts/active_record/migrate.js create_migration",
"db:migrate": "node node_modules/@vida-global/core/scripts/active_record/migrate.js migrate",
"db:rollback": "node node_modules/@vida-global/core/scripts/active_record/migrate.js rollback"
```

To generate a new migration file, run: `npm run db:create_migration createUsers`. This will automatically generate a migration file. Your migration can create tables, create indexes, and add, remove, or update columns.
```
module.exports = {
    up: async function() {
        await this.createTable('users', {
            email: this.DataTypes.STRING,
            team_id: this.DataTypes.INTEGER,
            is_admin: {
                type: this.DataTypes.BOOLEAN,
                defaultValue: false,
                allowNull: false,
            }
        });

        await this.addIndex('users', ['team_id'], {where: {team_id: {[this.Operators.ne]: null}}});
        await this.addIndex('users', ['email'], {unique: true});
    },

    down: async function () {
        await this.dropTable('users');
    }
}
```
Available migrations are:
```
createTable(tableName, details)
dropTable(tableName)
addColumn(tableName, columnName, columnDetails)
removeColumn(tableName, columnName)
addIndex(tableName, fields, { concurrently, unique, name, where })
removeIndex(tableName, indexNameOrAttributes, concurrently=false)
renameColumn(tableName, oldName, newName)
changeColumn(tableName, columnName, dataTypeOrOptions)
```
To run your migrations, run `npm run db:migrate` or `npm run db:rollback` to rollback a single migration.

**NOTE**: By default, `createTable` automatically adds an autoincrement, primary key `id` column, a `created_at` column, and an `updated_at` column.


# Models
The following code will create a basic model representing a user in our database:
```
const { ActiveRecord } = require('@vida-global/core')

class User extends ActiveRecord.BaseRecord {
}

User.initialize();

const user = new User({email: 'mark@vida.inc', team_id: 1, is_admin: false});
await user.save();

user.is_admin = true;
await user.save();

await user.destroy();
```


### Querying Models
```
const users = await User.findAll();
const users = await User.findAll{where: {team_id: 1}});
const users = await User.findAll{where: User.Operator

const users = await User.findAll({where: {
    team_id: {
        [Recording.Operators.or]: [1,2]
    }
}});

```


### Aggregators and Functions
```
const rows = await User.findAll({
    attributes: ['team_id', [User.fn('MAX', User.col('id')), 'max_id']],
    group: 'team_id'
});

const { count, users } = await User.findAndCountAll({
    where: {
        email: {
            [User.Operators.like]: '%@vida.inc',
        },
    },
    offset: 0,
    limit: 1,
});

const totalCount = await User.count({where: {team_id: 1}});
```
More examples can be found here, https://sequelize.org/docs/v6/core-concepts/model-querying-basics/.

**Note** The `sequelize.fn`, `sequelize.col`, and `Op` properties have been added as helpers on the Model (e.g. `User.fn('MAX', User.col('id'), 'max_id')` and `User.Operators.or`)


### Associations
**TODO**


### Validators
**TODO**


### Hooks
**TODO**


### Paranoid
**TODO**


# Closing Connections
When cleaning up your application, close all open connections with `User.closeAllConnections()`. This will close all connections for all models, not just the `User` model.
