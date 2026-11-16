/**
 * Mat-code constants and predicates: the code-vs-id discrimination.
 *
 * Pure: no DB, no imports outside `src/domain`. CommonJS runtime with a
 * type-only import as module marker (same convention as `ridingTime.ts` /
 * `scoring.ts`).
 */
import type { MatCodeModule } from './types';

/**
 * A mat code is exactly three dotted word runs (`morning.coffee.bicycle`).
 * Anchored: it used to match a dotted triple anywhere in the string
 * (`'!!a.b.c!!'`, `'a.b.c.d'`), which routed a malformed id to the code lookup.
 */
const CODE_REGEXP = /^\w+\.\w+\.\w+$/;

const ROLES = { ADMIN: 'admin', VIEWER: 'viewer' } as const;

/**
 * Whether `s` is routed as a mat code rather than a mat id
 * (`ServerController#initCurrentMat`: `MatCode.CODE_REGEXP.test(params.matId)`).
 * Same `RegExp#test` call, so non-strings are coerced the same way.
 */
function isMatCode(s: string): boolean {
    return CODE_REGEXP.test(s);
}

function isAdminCode(code: { role: string }): boolean {
    return code.role == ROLES.ADMIN;
}

function isViewerCode(code: { role: string }): boolean {
    return code.role == ROLES.VIEWER;
}

const matCode: MatCodeModule = {
    CODE_REGEXP,
    ROLES,
    isMatCode,
    isAdminCode,
    isViewerCode,
};

module.exports = matCode;
