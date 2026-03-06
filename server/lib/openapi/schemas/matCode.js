// JSON Schema (draft-07 / OpenAPI 3.1) for the MatCode model.
// Fields are derived from MatCode.apiSafeKeys which explicitly returns ['code', 'role'].
// The `role` field is an enum of 'admin' | 'viewer' per MatCode.ROLES.

const MatCode = {
    type: "object",
    properties: {
        code: {
            type: "string",
            description: "The join code string (word.word.word format)"
        },
        role: {
            type: "string",
            enum: ["admin", "viewer"],
            description: "The role granted when using this code"
        }
    },
    required: ["code", "role"]
};

module.exports = { MatCode };
