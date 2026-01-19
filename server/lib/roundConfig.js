// Round configuration for different match types
class RoundConfig {
    constructor(name, rounds) {
        this.name = name;
        this.rounds = rounds;  // Array of {index, maxPoints}
    }

    getRound(index) {
        return this.rounds.find(r => r.index === index);
    }

    getMaxPoints(index) {
        const round = this.getRound(index);
        return round ? round.maxPoints : null;
    }

    getRoundCount() {
        return this.rounds.length;
    }
}

// RdojoKombat configuration (matches client ScoreKeeper.kt)
const RdojoKombat = new RoundConfig('RdojoKombat', [
    { index: 1, maxPoints: 24 },
    { index: 2, maxPoints: 16 },
    { index: 3, maxPoints: 8 }
]);

// Config registry
const CONFIGS = {
    'RdojoKombat': RdojoKombat
};

function getRoundConfig(matchType) {
    return CONFIGS[matchType] || CONFIGS['RdojoKombat'];
}

module.exports = { RoundConfig, getRoundConfig, RdojoKombat };
