module.exports = {
    up: async function() {
        await this.createTable('judges_matches', {
            match_id: {
                allowNull: false,
                type:      this.DataTypes.UUID
            },
            user_id: {
                allowNull: false,
                type:      this.DataTypes.UUID
            },
        }, {id: false});

        await this.addIndex('judges_matches', ['user_id']);
        await this.addIndex('judges_matches', ['match_id', 'user_id'], {unique: true});
        
    },


    down: async function () {
        await this.dropTable('judges_matches');
    }
}
