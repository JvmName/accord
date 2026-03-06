// JSON Schema (draft-07 / OpenAPI 3.1) for the Round model.
// Round uses a fully custom toApiResponse() — it does NOT use apiSafeKeys.
// Fields returned:
//   id           (UUID string)          — this.id
//   started_at   (integer, ms)          — mapped from this.created_at (see Round.started_at getter)
//   ended_at     (integer | null, ms)   — null if the round is still in progress
//   max_duration (integer, ms)          — millisecond duration limit for this round
//   score        (object)               — keys are competitor UUIDs, values are integer scores
//   result       (object)               — { winner: User | null, method: { type: string | null, value: string | integer | null } }
// Timestamps are serialized as milliseconds (integer) via ServerController._formatJSONBody.

const Round = {
    type: "object",
    properties: {
        id: {
            type: "string",
            format: "uuid",
            description: "Unique identifier for the round"
        },
        started_at: {
            type: "integer",
            description: "Timestamp (ms since epoch) when the round started (mapped from created_at)"
        },
        ended_at: {
            type: "integer",
            nullable: true,
            description: "Timestamp (ms since epoch) when the round ended, or null if still ongoing"
        },
        max_duration: {
            type: "integer",
            description: "Maximum allowed duration for this round in milliseconds"
        },
        score: {
            type: "object",
            additionalProperties: {
                type: "integer"
            },
            description: "Map of competitor UUID to their score for this round"
        },
        result: {
            type: "object",
            properties: {
                winner: {
                    oneOf: [
                        { $ref: "#/components/schemas/User" },
                        { type: "null" }
                    ],
                    description: "The winning competitor for this round, or null"
                },
                method: {
                    type: "object",
                    nullable: true,
                    properties: {
                        type: {
                            type: "string",
                            nullable: true,
                            enum: ["submission", "points", "tie", null],
                            description: "How the round was won"
                        },
                        value: {
                            nullable: true,
                            description: "The submission name or point score; null if round is ongoing"
                        }
                    },
                    required: ["type", "value"],
                    description: "The method by which the round was won, or null if still in progress"
                }
            },
            required: ["winner", "method"],
            description: "The result of the round including winner and win method"
        }
    },
    required: ["id", "started_at", "ended_at", "max_duration", "score", "result"]
};

module.exports = { Round };
