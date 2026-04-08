module.exports = {
    up: async function() {
        await this.addColumn('matches', 'break_started_at', {
            allowNull: true,
            type:      this.DataTypes.DATE
        });

        await this.addColumn('matches', 'break_duration', {
            allowNull: true,
            type:      this.DataTypes.INTEGER
        });
    },


    down: async function () {
        await this.removeColumn('matches', 'break_started_at');
        await this.removeColumn('matches', 'break_duration');
    }
}
