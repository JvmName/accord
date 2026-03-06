module.exports = {
    up: async function() {
        await this.removeColumn('users', 'email');
    },


    down: async function () {
        await this.addColumn('users', 'email', {
                allowNull: false,
                type:      this.DataTypes.STRING,
                unique: true,
        });
    }
}
