module.exports = {
    up: async function() {
        await this.createTable('riding_time_votes', {
            round_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            judge_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            competitor_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            ended_at: this.DataTypes.DATE
        });

        await this.addIndex('riding_time_votes', ['round_id']);
    },


    down: async function () {
        await this.dropTable('riding_time_votes');
    }
}
