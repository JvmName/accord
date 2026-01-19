module.exports = {
    up: async function() {
        await this.addColumn('matches', 'match_type', {
            type: this.DataTypes.STRING,
            allowNull: true,
            defaultValue: 'RdojoKombat'
        });
    },

    down: async function() {
        await this.removeColumn('matches', 'match_type');
    }
};
