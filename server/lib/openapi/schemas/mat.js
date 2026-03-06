// JSON Schema (draft-07 / OpenAPI 3.1) for the Mat model.
// Base fields come from Mat's inherited apiSafeKeys (all non-timestamp, non-camelCase columns):
//   id, name, judge_count, creator_id
// Optional association fields are added by Mat.toApiResponse() when the relevant
// include options are set: judges, codes, current_match, upcoming_matches.
// These are present in properties but omitted from required.

const Mat = {
    type: "object",
    properties: {
        id: {
            type: "string",
            format: "uuid",
            description: "Unique identifier for the mat"
        },
        name: {
            type: "string",
            description: "Display name of the mat"
        },
        judge_count: {
            type: "integer",
            description: "Number of judges required for this mat"
        },
        creator_id: {
            type: "string",
            format: "uuid",
            nullable: true,
            description: "UUID of the user who created the mat"
        },
        judges: {
            type: "array",
            items: { $ref: "#/components/schemas/User" },
            description: "Judges assigned to this mat (included when requested)"
        },
        codes: {
            type: "array",
            items: { $ref: "#/components/schemas/MatCode" },
            description: "Join codes for this mat (included when requested)"
        },
        current_match: {
            oneOf: [
                { $ref: "#/components/schemas/Match" },
                { type: "null" }
            ],
            description: "The currently active (started) match on this mat, or null"
        },
        upcoming_matches: {
            type: "array",
            items: { $ref: "#/components/schemas/Match" },
            description: "Matches queued on this mat that have not yet started"
        }
    },
    required: ["id", "name", "judge_count", "creator_id"]
};

module.exports = { Mat };
