/**
 * Narrowing for values the data model guarantees but the types cannot:
 * relation lookups return `null` for a row that does not exist. A missing row
 * here is a corrupt database, not a client mistake, so it is a TypeError rather
 * than a branch.
 */
export function present<T>(value: T | null | undefined, what: string): T {
    if (value === null || value === undefined) throw new TypeError(`Expected ${what} to exist`);
    return value;
}
