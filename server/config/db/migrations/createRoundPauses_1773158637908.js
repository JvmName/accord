module.exports = {
    up: async function() {
        await this.createTable('round_pauses', {
            id: {
                allowNull: false,
                primaryKey: true,
                type: this.DataTypes.UUID
            },
            round_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            paused_at: {
                allowNull: false,
                type: this.DataTypes.DATE
            },
            resumed_at: this.DataTypes.DATE
        });

        await this.addIndex('round_pauses', ['round_id']);
    },


    down: async function () {
        await this.dropTable('round_pauses');
    }
}
