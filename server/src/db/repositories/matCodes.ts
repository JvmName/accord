/**
 * `mat_codes` repository (server-ts task 10). Code generation
 * (`MatCode.generateCode()`, which calls the external word generator) is not
 * data access and is not here; the regexp and roles are in
 * `src/domain/matCode.ts`.
 */
import { asc, eq } from 'drizzle-orm';
import { mat_codes } from '../schema';
import type { MatCode } from '../types';
import { assertDefined, insertStamps, orNull, type DbOrTx } from './internal';

/**
 * `MatCode.findByCode(code)`: exact, case-sensitive equality on the unique
 * `code` column (no regexp check here; the caller discriminates with
 * `isMatCode`). Returns the row or `null` (Sequelize `findOne`). `undefined`
 * throws like Sequelize's `where: {code: undefined}`; the only caller guards
 * with `if (matCode)`.
 */
export async function findMatCodeByCode(db: DbOrTx, code: string | null | undefined): Promise<MatCode | null> {
    assertDefined(code, 'code');
    if (code === null) return null; // `code IS NULL` — the column is NOT NULL, so never a match
    return orNull(await db.query.mat_codes.findFirst({ where: eq(mat_codes.code, code) }));
}

/**
 * `mat.getMatCodes()` (Mat#toApiResponse `includeCodes`). Legacy order: SQLite
 * walks the unique index `(mat_id, role)`, so rows come back by `role`
 * (`admin` before `viewer`), not by insertion.
 */
export async function findMatCodesForMat(db: DbOrTx, matId: string): Promise<MatCode[]> {
    return await db.query.mat_codes.findMany({
        where:   eq(mat_codes.mat_id, matId),
        orderBy: [asc(mat_codes.role)],
    });
}

export interface InsertMatCodeValues {
    mat_id: string;
    code: string;
    role: string;
    id?: string;
}

/** `MatCode.create({ code, role, mat_id })`. Throws on a duplicate `code` or `(mat_id, role)` (unique indexes). */
export async function insertMatCode(db: DbOrTx, values: InsertMatCodeValues): Promise<MatCode> {
    const [row] = await db.insert(mat_codes).values({
        ...(values.id ? { id: values.id } : {}),
        mat_id: values.mat_id,
        code:   values.code,
        role:   values.role,
        ...insertStamps(),
    }).returning();
    return row;
}
