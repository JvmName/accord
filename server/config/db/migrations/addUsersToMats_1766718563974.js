module.exports = {
    up: async function() {
        await this.addColumn('mats', 'creator_id', {type: this.DataTypes.UUID});
        await this.createTable('judges_mats', {
            judge_id: {
                allowNull: false,
                type:      this.DataTypes.UUID
            },
            mat_id: {
                allowNull: false,
                type:      this.DataTypes.UUID
            },
        }, {id: false});

        await this.addIndex('judges_mats', ['mat_id']);
        await this.addIndex('judges_mats', ['mat_id', 'judge_id'], {unique: true});
    },


    down: async function () {
        await this.removeColumn('mats', 'creator_id');
        await this.dropTable('judges_mats');
    }
}
