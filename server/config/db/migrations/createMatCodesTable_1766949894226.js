module.exports = {
    up: async function() {
        await this.createTable('mat_codes', {
            mat_id: {
                allowNull: false,
                type: this.DataTypes.UUID
            },
            code: {
                allowNull: false,
                type: this.DataTypes.STRING,
                unique: true
            },
            role: {
                allowNull: false,
                type: this.DataTypes.STRING
            }
        });
        await this.addIndex('mat_codes', ['mat_id', 'role'], {unique: true});
        await this.removeColumn('mats', 'code');
    },


    down: async function () {
      return;
        await this.dropTable('mat_codes');
        await this.addColumn('mats', 'code', {
            allowNull: false,
            type:   this.DataTypes.STRING,
            unique: true
        });
    }
}
