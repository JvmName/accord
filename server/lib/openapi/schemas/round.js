// JSON Schema (draft-07 / OpenAPI 3.1) for the Round model.
// Round uses a fully custom toApiResponse() — it does NOT use apiSafeKeys.
// Fields returned:
//   id             (UUID string)               — this.id
//   started_at     (ISO 8601 string)           — mapped from this.created_at (see Round.started_at getter)
//   ended_at       (ISO 8601 string | null)    — null if the round is still in progress
//   max_duration   (integer, seconds)          — duration limit for this round in seconds
//   time_remaining (integer | null, seconds)   — seconds remaining; null if round has ended
//   score          (object)                    — keys are competitor UUIDs, values are integer scores
//   result         (object)                    — { winner: User | null, method: { type: string | null, value: string | null } }
// Timestamps are serialized as ISO 8601 strings via ServerController._formatJSONBody (Date.toISOString()).

const Round = {
    type: "object",
    properties: {
        id: {
            type: "string",
            format: "uuid",
            description: "Unique identifier for the round"
        },
        started_at: {
            type: "string",
            format: "date-time",
            description: "ISO 8601 timestamp when the round started (mapped from created_at)"
        },
        ended_at: {
            type: ["string", "null"],
            format: "date-time",
            description: "ISO 8601 timestamp when the round ended, or null if still ongoing"
        },
        max_duration: {
            type: "integer",
            description: "Maximum allowed duration for this round in seconds"
        },
        paused: {
            type: "boolean",
            description: "Whether the round is currently paused"
        },
        time_remaining: {
            type: ["integer", "null"],
            description: "Seconds remaining in the round; null if the round has ended"
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
                    type: ["object", "null"],
                    properties: {
                        type: {
                            type: ["string", "null"],
                            enum: ["submission", "points", "tie", "tech-fall", null],
                            description: "How the round was won"
                        },
                        value: {
                            type: ["string", "null"],
                            description: "The submission name or point score as a string; null if round is ongoing"
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
    required: ["id", "started_at", "ended_at", "max_duration", "paused", "time_remaining", "score", "result"]
};

module.exports = { Round };
