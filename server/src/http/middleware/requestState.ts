/**
 * Request-state resolution (server-ts task 12): the replacement for
 * `ServerController#setupRequestState` (`#initCurrentUser`, `#initCurrentMat`,
 * `#initCurrentMatch`) and `RidingTimeVoteController#initCurrentRound`.
 *
 * Reproduced exactly, including what it reads from: the legacy MERGED
 * parameter bag (path < body < query, F-73), NOT the path alone. Every route
 * resolves state the same way (legacy ran `setupRequestState` for every
 * action, health check included); only the riding-time routes also resolve
 * the current round, as only `RidingTimeVoteController` did.
 *
 * Failure semantics (also reproduced): legacy called `setupRequestState`
 * OUTSIDE `performRequest`'s try/catch, so an exception here (in practice: a
 * database failure) never reached `handleError` and was answered by Express's
 * default error handler instead of the JSON envelope. The registry keeps that
 * split (`router.ts`).
 */
import type { NextFunction, Request, Response } from 'express';
import { findMatCodeByCode } from '../../db/repositories/matCodes';
import { findMatchById } from '../../db/repositories/matches';
import { findMatById } from '../../db/repositories/mats';
import { findLastRound } from '../../db/repositories/rounds';
import { findUserByApiToken } from '../../db/repositories/users';
import type { DbOrTx } from '../../db/repositories/internal';
import type { Mat, MatCode, Match, Round, User } from '../../db/types';
import type { MatCodeModule } from '../../domain/types';
import { buildLegacyInput } from '../legacyInput';
import type { AuthorizeSpec } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MatCodes: MatCodeModule = require('../../domain/matCode');

export interface RequestState {
    /** The legacy merged parameter bag (`ServerController#params`), built once. */
    readonly input: Record<string, unknown>;
    currentUser: User | null;
    currentMat: Mat | null;
    currentMatCode: MatCode | null;
    currentMatch: Match | null;
    currentRound: Round | null;
    /**
     * `false` while resolving; set by the gates. Errors raised before it is set
     * bypass the JSON error handler, as legacy `setupRequestState` errors did.
     */
    handling: boolean;
}

const STATE_KEY = 'accordRequestState';

export function getRequestState(res: Response): RequestState {
    const state = res.locals[STATE_KEY] as RequestState | undefined;
    if (!state) throw new Error('request state was not resolved for this route');
    return state;
}

/** `#initCurrentUser`: `if (this.apiToken) this.#currentUser = await User.findByApiToken(this.apiToken)`. */
async function resolveUser(db: DbOrTx, req: Request): Promise<User | null> {
    const apiToken = req.headers['x-api-token'];
    if (apiToken) return await findUserByApiToken(db, apiToken as string);
    return null;
}

/**
 * `#initCurrentMat`, including the `MatCode.CODE_REGEXP`-vs-UUID
 * discrimination (serverController.js:315). The regexp is the UNANCHORED
 * legacy one from `src/domain/matCode.ts` (F-12).
 */
async function resolveMat(db: DbOrTx, input: Record<string, unknown>): Promise<{ mat: Mat | null; matCode: MatCode | null }> {
    let mat: Mat | null = null;
    let matCode: MatCode | null = null;

    let code = input.matCode;
    if (!code && input.matId) {
        if (MatCodes.CODE_REGEXP.test(input.matId as string)) {
            code = input.matId;
        } else {
            mat = await findMatById(db, input.matId as string);
        }
    }

    if (code) {
        matCode = await findMatCodeByCode(db, code as string);
        if (matCode) {
            mat = await findMatById(db, matCode.mat_id);
        }
    }

    return { mat, matCode };
}

/** `#initCurrentMatch`: only when the bag carries a `matchId`. */
async function resolveMatch(db: DbOrTx, input: Record<string, unknown>): Promise<Match | null> {
    if (!input.matchId) return null;
    return await findMatchById(db, input.matchId as string);
}

/**
 * `RidingTimeVoteController#initCurrentRound`: the LAST round, and only if it
 * is started and not ended (`started` is `Boolean(created_at)`, always true for
 * a stored row; `ended` is `Boolean(ended_at)`).
 */
async function resolveOpenRound(db: DbOrTx, match: Match | null): Promise<Round | null> {
    if (!match) return null;
    const round = await findLastRound(db, match.id);
    if (!round || !round.created_at || round.ended_at) return null;
    return round;
}

export async function resolveRequestState(db: DbOrTx, req: Request, spec: AuthorizeSpec): Promise<RequestState> {
    const input       = buildLegacyInput(req);
    const currentUser = await resolveUser(db, req);
    const { mat, matCode } = await resolveMat(db, input);
    const currentMatch = await resolveMatch(db, input);
    const currentRound = 'round' in spec && spec.round === 'open' ? await resolveOpenRound(db, currentMatch) : null;

    return {
        input,
        currentUser,
        currentMat:     mat,
        currentMatCode: matCode,
        currentMatch,
        currentRound,
        handling:       false,
    };
}

/** Express middleware: resolves and stores the request state. */
export function requestStateMiddleware(db: DbOrTx, spec: AuthorizeSpec) {
    return async function resolveState(req: Request, res: Response, next: NextFunction): Promise<void> {
        let state: RequestState;
        try {
            state = await resolveRequestState(db, req, spec);
        } catch (err) {
            next(err);
            return;
        }
        res.locals[STATE_KEY] = state;
        next();
    };
}
