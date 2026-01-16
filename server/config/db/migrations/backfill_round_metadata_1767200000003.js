module.exports = {
    up: async function() {
        // Backfill migration - no-op since database is new
        // In production with existing data, this would:
        // - Set round_type = 'RdojoKombat' for existing matches
        // - Set round_index (1, 2, 3) and max_points (24, 16, 8) for existing rounds
    },

    down: async function() {
        // No-op - can't reliably reverse backfill
    }
};
