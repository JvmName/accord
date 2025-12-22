// This is in a separate file so that it can be easily mocked during testing
module.exports = function(filePath, tableName) {
    return require(filePath)[tableName];
}
