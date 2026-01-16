module.exports = {
    up: async function() {
        await this.addColumn('rounds', 'round_index', {
            type: this.DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null
        });

        await this.addColumn('rounds', 'max_points', {
            type: this.DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null
        });
    },

    down: async function() {
        await this.removeColumn('rounds', 'round_index');
        await this.removeColumn('rounds', 'max_points');
    }
};
