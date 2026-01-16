module.exports = {
    up: async function() {
        await this.addColumn('matches', 'round_type', {
            type: this.DataTypes.STRING,
            allowNull: true,
            defaultValue: 'RdojoKombat'
        });
    },

    down: async function() {
        await this.removeColumn('matches', 'round_type');
    }
};
