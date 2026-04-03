// This is in a separate file so that it can be easily mocked during testing
module.exports = function(filePath, tableName) {
    const schema = require(filePath)[tableName]
    return structuredClone(schema);
}
