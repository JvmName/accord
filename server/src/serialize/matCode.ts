/**
 * `MatCode` -> wire (server-ts task 11).
 *
 * Legacy: `MatCode#apiSafeKeys` returns exactly `['code', 'role']`, each
 * `|| null` (`models/matCode.js`). Rendered only by `POST /mats`
 * (`includeCodes`), as `Mat.codes`.
 */
import type { MatCode as WireMatCode } from '../contract/matCode';
import type { MatCode } from '../db/types';
import { legacyColumn } from './values';

export type MatCodeInput = Pick<MatCode, 'code' | 'role'>;

export function serializeMatCode(matCode: MatCodeInput): WireMatCode {
    return {
        code: legacyColumn(matCode.code) as string, // `|| null` quirk, F-63
        // The column is free text; the wire schema narrows it to admin|viewer.
        role: legacyColumn(matCode.role) as WireMatCode['role'],
    };
}
