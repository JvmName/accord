/**
 * Mat-code constants and predicates (server-ts task 10), lifted out of
 * `models/matCode.js` so the code-vs-id discrimination survives the model.
 *
 * Pure: no DB, no imports outside `src/domain`. CommonJS runtime with a
 * type-only import as module marker (same convention as `ridingTime.ts` /
 * `scoring.ts`), so the legacy stack could `require()` it unchanged.
 */
import type { MatCodeModule } from './types';

/**
 * EXACTLY the legacy `MatCode.CODE_REGEXP`. It is UNANCHORED (FINDINGS F-12):
 * it matches a dotted word triple anywhere in the string
 * (`'!!a.b.c!!'`, `'a.b.c.d'`, `'1.2.3'`, `'_._._'` all match). Do not anchor
 * it here: anchoring is a behaviour change reserved for task 18.
 */
const CODE_REGEXP = /\w+\.\w+\.\w+/;

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
