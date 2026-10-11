/**
 * Custom Drizzle column types (server-ts task 09).
 *
 * `isoDateTime` stores a JS `Date` as ISO 8601 UTC text
 * (`YYYY-MM-DDTHH:mm:ss.SSSZ`, i.e. `Date#toISOString()`) in a TEXT column and
 * reads it back with `new Date(text)` (FINDINGS F-39). The legacy Sequelize
 * override (`lib/activeRecord/db/isoDateTime.js`) writes identical text.
 *
 * The declared SQL type is `text`, so the generated DDL is unchanged from the
 * plain `text()` columns this replaced. NULL is passed through by Drizzle
 * itself (it never calls the mappers for NULL); `test/db/` checks that.
 *
 * ES `export` like `schema.ts`: only ever loaded through `schema.ts`.
 */
import { customType } from 'drizzle-orm/sqlite-core';

export const isoDateTime = customType<{ data: Date; driverData: string }>({
    dataType() {
        return 'text';
    },
    toDriver(value: Date): string {
        return value.toISOString();
    },
    fromDriver(value: string): Date {
        return new Date(value);
    },
});
