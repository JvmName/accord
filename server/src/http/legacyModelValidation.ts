/**
 * The Sequelize model validation the legacy models ran before every INSERT,
 * reduced to the two checks an API request can trigger. Bodies are validated
 * by presence only (`routes/requests.ts`), so values such as `name: {}` or
 * `judge_count: null` reach the insert, and the legacy server answered them
 * with a 500 carrying Sequelize's message. The handlers call this before
 * inserting so the same request gets the same 500 and the same message.
 */

/** Thrown in place of Sequelize's `ValidationError`. Rendered as a 500 `{ error: message }`. */
export class LegacyModelValidationError extends Error {}

export interface LegacyColumnCheck {
    /** Attribute name, as Sequelize reports it. */
    field: string;
    value: unknown;
    /** `allowNull: false` with no default that applies. */
    notNull?: boolean;
    /** A STRING/TEXT attribute: an array or an object is rejected. */
    string?: boolean;
}

/**
 * Throws when any column fails, with every failure in column order, formatted
 * as Sequelize formats them: `<type>: <message>` joined by `,\n`, e.g.
 * `string violation: name cannot be an array or an object,\nnotNull Violation:
 * Mat.judge_count cannot be null`. Pass the columns in table column order.
 */
export function assertLegacyModelValid(model: string, columns: readonly LegacyColumnCheck[]): void {
    const messages: string[] = [];
    for (const column of columns) {
        if (column.notNull && (column.value === null || column.value === undefined)) {
            messages.push(`notNull Violation: ${model}.${column.field} cannot be null`);
        }
        if (column.string && typeof column.value === 'object' && column.value !== null) {
            messages.push(`string violation: ${column.field} cannot be an array or an object`);
        }
    }
    if (messages.length) throw new LegacyModelValidationError(messages.join(',\n'));
}
