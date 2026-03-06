// JSON Schema (draft-07 / OpenAPI 3.1) for the User model.
// Fields are derived from the `users` table in config/db/schemas/default.js
// and filtered through User.apiSafeKeys (which strips `api_token`).
// Timestamps are serialized as milliseconds (integer) via ServerController._formatJSONBody.

const User = {
    type: "object",
    properties: {
        id: {
            type: "string",
            format: "uuid",
            description: "Unique identifier for the user"
        },
        name: {
            type: "string",
            description: "Display name of the user"
        }
    },
    required: ["id", "name"]
};

module.exports = { User };
