module.exports = {
    up: async function() {
        await this.createTable('users', {
            name: {
                allowNull: false,
                type:      this.DataTypes.STRING,
            },
            email: {
                allowNull: false,
                type:      this.DataTypes.STRING,
                unique: true,
            },
            apiToken: {
                allowNull: false,
                type:      this.DataTypes.STRING,
            }
        });
    },


    down: async function () {
        await this.dropTable('users'); 
    }
}
