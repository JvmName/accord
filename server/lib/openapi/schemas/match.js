// JSON Schema (draft-07 / OpenAPI 3.1) for the Match model.
// Base fields come from Match.apiSafeKeys: ['creator_id', 'id', 'mat_id', 'started_at', 'ended_at']
// Note: red_score and blue_score exist in the DB but are intentionally excluded from apiSafeKeys.
// Match.toApiResponse() always adds: red_competitor, blue_competitor, winner.
// Optional associations (present in properties but not required): mat, judges, rounds.
// Timestamps are serialized as milliseconds (integer) via ServerController._formatJSONBody.

const Match = {
    type: "object",
    properties: {
        id: {
            type: "string",
            format: "uuid",
            description: "Unique identifier for the match"
        },
        creator_id: {
            type: "string",
            format: "uuid",
            description: "UUID of the user who created the match"
        },
        mat_id: {
            type: "string",
            format: "uuid",
            description: "UUID of the mat this match belongs to"
        },
        started_at: {
            type: "integer",
            nullable: true,
            description: "Timestamp (ms since epoch) when the match started, or null if not yet started"
        },
        ended_at: {
            type: "integer",
            nullable: true,
            description: "Timestamp (ms since epoch) when the match ended, or null if still ongoing"
        },
        red_competitor: {
            $ref: "#/components/schemas/User",
            description: "The competitor assigned to the red corner"
        },
        blue_competitor: {
            $ref: "#/components/schemas/User",
            description: "The competitor assigned to the blue corner"
        },
        winner: {
            oneOf: [
                { $ref: "#/components/schemas/User" },
                { type: "null" }
            ],
            description: "The winning competitor, or null if the match has no winner yet"
        },
        mat: {
            $ref: "#/components/schemas/Mat",
            description: "The mat this match is held on (included when requested)"
        },
        judges: {
            type: "array",
            items: { $ref: "#/components/schemas/User" },
            description: "Judges assigned to this match (included when requested)"
        },
        rounds: {
            type: "array",
            items: { $ref: "#/components/schemas/Round" },
            description: "Rounds played in this match (included when requested)"
        }
    },
    required: ["id", "creator_id", "mat_id", "started_at", "ended_at", "red_competitor", "blue_competitor", "winner"]
};

module.exports = { Match };
