function endRoundValidations() {
    return {
        winner: { isEnum: { enums: [undefined, 'red', 'blue'] } }
    };
}


module.exports = { endRoundValidations };
