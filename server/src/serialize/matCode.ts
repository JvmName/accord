/**
 * `MatCode` -> wire.
 *
 * Exactly `code` and `role`. Rendered only by `POST /mats`, as `Mat.codes`.
 */
import type { MatCode as WireMatCode } from '../contract/matCode';
import type { MatCode } from '../db/types';

export type MatCodeInput = Pick<MatCode, 'code' | 'role'>;

export function serializeMatCode(matCode: MatCodeInput): WireMatCode {
    return {
        code: matCode.code,
        // The column is free text; the wire schema narrows it to admin|viewer.
        role: matCode.role as WireMatCode['role'],
    };
}
