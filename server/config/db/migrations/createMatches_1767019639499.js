module.exports = {
    up: async function() {
        await this.createTable('matches', {
            creator_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            mat_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            red_competitor_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            blue_competitor_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            red_score: {
                allowNull: false,
                defaultValue: 0,
                type: this.DataTypes.INTEGER
            },
            blue_score: {
                allowNull: false,
                defaultValue: 0,
                type: this.DataTypes.INTEGER
            },
            started_at:   this.DataTypes.DATE,
            completed_at: this.DataTypes.DATE,
        });
    },


    down: async function () {
        await this.dropTable('matches');
    }
}
