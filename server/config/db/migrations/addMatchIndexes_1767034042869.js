module.exports = {
    up: async function() {
        await this.addIndex('matches', ['mat_id']);
        await this.addIndex('matches', ['mat_id'], {where: {ended_at: null},
                                                    name: 'incomplete_matches_idx'});
    },


    down: async function () {
        await this.removeIndex('matches', ['mat_id']);
        await this.removeIndex('matches', 'incomplete_matches_idx');
    }
}
