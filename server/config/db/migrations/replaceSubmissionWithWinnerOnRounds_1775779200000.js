module.exports = {
    up: async function() {
        await this.removeColumn('rounds', 'submission');
        await this.removeColumn('rounds', 'submission_by');
        await this.addColumn('rounds', 'declared_winner_id', { type: this.DataTypes.UUID, allowNull: true });
        await this.addColumn('rounds', 'stoppage',           { type: this.DataTypes.BOOLEAN, allowNull: true });
    },


    down: async function () {
        await this.addColumn('rounds', 'submission',    { type: this.DataTypes.STRING, allowNull: true });
        await this.addColumn('rounds', 'submission_by', { type: this.DataTypes.UUID, allowNull: true });
        await this.removeColumn('rounds', 'declared_winner_id');
        await this.removeColumn('rounds', 'stoppage');
    }
}
