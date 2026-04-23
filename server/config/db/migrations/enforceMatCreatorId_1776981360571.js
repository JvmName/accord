module.exports = {
    up: async function() {
        // Drop and recreate mats to enforce allowNull: false on creator_id.
        // The original addUsersToMats migration added creator_id without allowNull: false,
        // so pre-migration mats have creator_id = null. SQLite doesn't support ALTER COLUMN,
        // and doesn't enforce foreign keys, so dependent tables are left in place.
        await this.dropTable('mats');
        await this.createTable('mats', {
            name:        { allowNull: false, type: this.DataTypes.STRING },
            judge_count: { allowNull: false, defaultValue: 1, type: this.DataTypes.INTEGER },
            creator_id:  { allowNull: false, type: this.DataTypes.UUID },
        });
    },

    down: async function() {
        await this.removeColumn('mats', 'creator_id');
        await this.addColumn('mats', 'creator_id', {
            type:      this.DataTypes.UUID,
            allowNull: true,
        });
    }
};
