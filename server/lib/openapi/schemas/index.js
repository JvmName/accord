// Central export for all OpenAPI / JSON Schema model schemas.
// Keys are PascalCase to match $ref resolution: #/components/schemas/User etc.

const { User }    = require('./user');
const { Mat }     = require('./mat');
const { MatCode } = require('./matCode');
const { Match }   = require('./match');
const { Round }   = require('./round');

module.exports = { User, Mat, MatCode, Match, Round };
