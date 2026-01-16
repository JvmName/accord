module.exports = {
    up: async function() {
        await this.addColumn('rounds', 'tech_fall_winner', {
            type: this.DataTypes.STRING,
            allowNull: true
        });
    },

    down: async function() {
        await this.removeColumn('rounds', 'tech_fall_winner');
    }
};
