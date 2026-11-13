/**
 * Request-state resolution: the current user, mat, mat code, match and (for
 * the riding-time routes) open round of a request.
 *
 * Resources are resolved from the PATH parameters only; a body or
 * query key of the same name no longer replaces them. Every route resolves
 * state the same way, the health check included.
 *
 * An exception here (in practice: a database failure) goes through the JSON
 * error handler like any other (the client cannot decode an HTML 500).
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
import type { AuthorizeSpec } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MatCodes: MatCodeModule = require('../../domain/matCode');

export interface RequestState {
    currentUser: User | null;
    currentMat: Mat | null;
    currentMatCode: MatCode | null;
    currentMatch: Match | null;
    currentRound: Round | null;
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
 * The mat of a request: `:matCode` names a mat code; `:matId` names a mat id,
 * or a mat code when it has the shape of one (`MatCode.CODE_REGEXP`).
 */
async function resolveMat(db: DbOrTx, params: Record<string, string | undefined>): Promise<{ mat: Mat | null; matCode: MatCode | null }> {
    let mat: Mat | null = null;
    let matCode: MatCode | null = null;

    let code = params.matCode;
    if (!code && params.matId) {
        if (MatCodes.CODE_REGEXP.test(params.matId)) {
            code = params.matId;
        } else {
            mat = await findMatById(db, params.matId);
        }
    }

    if (code) {
        matCode = await findMatCodeByCode(db, code);
        if (matCode) {
            mat = await findMatById(db, matCode.mat_id);
        }
    }

    return { mat, matCode };
}

/** The match of a request: only when the path has a `:matchId`. */
async function resolveMatch(db: DbOrTx, params: Record<string, string | undefined>): Promise<Match | null> {
    if (!params.matchId) return null;
    return await findMatchById(db, params.matchId);
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
    const params       = (req.params ?? {}) as Record<string, string | undefined>;
    const currentUser  = await resolveUser(db, req);
    const { mat, matCode } = await resolveMat(db, params);
    const currentMatch = await resolveMatch(db, params);
    const currentRound = 'round' in spec && spec.round === 'open' ? await resolveOpenRound(db, currentMatch) : null;

    return {
        currentUser,
        currentMat:     mat,
        currentMatCode: matCode,
        currentMatch,
        currentRound,
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
