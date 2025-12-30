module.exports = {
    up: async function() {
        await this.createTable('rounds', {
            match_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            submission_by: this.DataTypes.UUID,
            submission:    this.DataTypes.STRING,
            ended_at:      this.DataTypes.DATE
        });

        await this.addIndex('rounds', ['match_id']);
    },


    down: async function () {
        await this.dropTable('rounds');
    }
}
