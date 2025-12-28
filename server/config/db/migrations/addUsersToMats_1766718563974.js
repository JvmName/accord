module.exports = {
    up: async function() {
        await this.addColumn('mats', 'creator_id', {type: this.DataTypes.UUID});

        await this.createTable('judges_mats', {
            mat_id: {
                allowNull: false,
                type:      this.DataTypes.UUID
            },
            user_id: {
                allowNull: false,
                type:      this.DataTypes.UUID
            },
        }, {id: false});

        await this.addIndex('judges_mats', ['user_id']);
        await this.addIndex('judges_mats', ['mat_id', 'user_id'], {unique: true});

        await this.createTable('mats_viewers', {
            mat_id: {
                allowNull: false,
                type:      this.DataTypes.UUID
            },
            user_id: {
                allowNull: false,
                type:      this.DataTypes.UUID
            },
        }, {id: false});

        await this.addIndex('mats_viewers', ['user_id']);
        await this.addIndex('mats_viewers', ['mat_id', 'user_id'], {unique: true});
    },


    down: async function () {
        await this.removeColumn('mats', 'creator_id');
        await this.dropTable('judges_mats');
        await this.dropTable('mats_viewers');
    }
}
