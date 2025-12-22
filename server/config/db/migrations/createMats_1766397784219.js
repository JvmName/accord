module.exports = {
    up: async function() {
        await this.createTable('mats', {
            name: {
                allowNull: false,
                type: this.DataTypes.STRING,
            },
            judge_count: {
                allowNull: false,
                defaultValue: 1,
                type: this.DataTypes.INTEGER,
            },
            code: {
                allowNull: false,
                type:   this.DataTypes.STRING,
                unique: true
            }
        });
    },

    down: async function () {
        await this.dropTable('mats');
    }
}
