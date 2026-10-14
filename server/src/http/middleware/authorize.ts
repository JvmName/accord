/**
 * Authentication + authorization gates (server-ts task 12): the replacement for
 * the controllers' before-callbacks (`authenticateRequest`, `requireMatch`,
 * `authenticateMatch`) and the unconditional `authorize()` calls at the top of
 * actions.
 *
 * SECURITY BOUNDARY. Each `AuthorizeSpec` variant expands to the exact legacy
 * check sequence, in the legacy order, because the order is observable:
 * whichever check fails first decides between 401, 404 and 400. Every
 * expansion below cites the code it reproduces. Proven by
 * `test/http/authorizationParity.test.ts` (the task-02b matrix, every row,
 * grants AND denies) and `test/http/permissions.test.ts` (differential against
 * the legacy `Authorizer`).
 *
 * A gate either passes (returns `null`), returns a `Rendered` (404 / 400, as the
 * legacy callbacks rendered and returned `false`), or throws
 * `AuthorizationError` (401, as legacy `authorize()` threw).
 *
 * Note on `authenticateRequest`: legacy also ran `authorize('view', mat)` and
 * `authorize('view', match)` for whatever mat/match the bag resolved. Both are
 * unconditionally `true` for a non-null scope and are skipped for a null one,
 * so they can never deny and are not repeated here.
 */
import type { NextFunction, Request, Response } from 'express';
import type { DbOrTx } from '../../db/repositories/internal';
import { Rendered, renderErrors, renderNotFound, renderUnauthorized, sendRendered } from '../envelope';
import { AuthorizationError } from '../errors';
import { can, repositoryLoaders, type ActionFor, type PermissionLoaders, type Scope, type Subject } from '../permissions';
import type { AuthorizeSpec } from '../types';
import { getRequestState, type RequestState } from './requestState';

/** Legacy `ServerController#authorize(action, scope)`: throw on deny. */
export async function assertCan<S extends Scope>(
    subject: Subject,
    action: ActionFor<S>,
    scope: S,
    loaders: PermissionLoaders,
): Promise<void> {
    const authorized = await can(subject, action, scope, loaders);
    if (!authorized) throw new AuthorizationError();
}

function subjectOf(state: RequestState): Subject {
    return { user: state.currentUser, matCode: state.currentMatCode };
}

/**
 * Runs the gate sequence for `spec`. Exported for tests; the registry uses
 * `authorizeMiddleware`.
 */
export async function runGates(spec: AuthorizeSpec, state: RequestState, loaders: PermissionLoaders): Promise<Rendered | null> {
    const subject = subjectOf(state);

    switch (spec.scope) {
        case 'none':
            // System/Docs controllers and `POST /users` (`except: 'postIndex'`):
            // no callbacks, no authorize().
            return null;

        case 'newMat':
            // MatsController#postIndex: `authorize('create', Mat)` with the Mat
            // CLASS as scope -> Boolean(currentUser). No authenticateRequest
            // callback; the 401 comes from the AuthorizationError.
            await assertCan(subject, 'create', { kind: 'matClass' }, loaders);
            return null;

        case 'mat':
            // MatsController#getMat: `authorize('view', this.currentMat)`.
            // Unauthenticated BY DESIGN (F-15, decision 2026-10-11). A missing
            // mat is a null scope -> false -> 401, not 404 (F-16).
            await assertCan(subject, 'view', { kind: 'mat', mat: state.currentMat }, loaders);
            return null;

        case 'matCode':
            switch (spec.level) {
                case 'public':
                    // `POST /mat/:matCode/join` is excluded from authenticateRequest
                    // (`except: 'postJoin'`). Its unknown-code 404 and its
                    // role-dependent assign/'be assigned judge' checks live in the
                    // handler (`addUser`), so nothing is checked here.
                    return null;

                case 'view':
                    // mat/usersController.js#authenticateRequest:
                    //     const authenticated = super.authenticateRequest();   // NOT awaited
                    //     if (authenticated === false) return false;             // never true: a Promise
                    //     if (!this.currentMat) { renderNotFound; return false }
                    // The unawaited super call starts the 401 render, but the
                    // subclass synchronously sets statusCode 404 before that render
                    // reads it, so a MISSING MAT wins over a missing user (probed:
                    // anonymous + unknown code -> 404 "not found"). With a known mat
                    // and no user the 401 is what goes out. F-74.
                    if (!state.currentMat) return renderNotFound();
                    if (!state.currentUser) return renderUnauthorized();
                    return null;

                case 'create a match':
                    // MatchesController: authenticateRequest (401 without a user),
                    // `requireMatch` skipped for postIndex, then the action's
                    //     authorize('create a match', currentMat)
                    //     authorize('assign',         currentMat)
                    // (identical checks: the request's mat code must be the ADMIN
                    // code OF THIS MAT; membership is irrelevant). A missing mat is
                    // a null scope -> 401.
                    if (!state.currentUser) return renderUnauthorized();
                    await assertCan(subject, 'create a match', { kind: 'mat', mat: state.currentMat }, loaders);
                    await assertCan(subject, 'assign',         { kind: 'mat', mat: state.currentMat }, loaders);
                    return null;
            }
            break;

        case 'match':
            // Common prefix of MatchesController (authenticateRequest,
            // requireMatch), RoundsController and RidingTimeVoteController
            // (authenticateRequest, authenticateMatch).
            if (!state.currentUser) return renderUnauthorized();
            if (!state.currentMatch) {
                // F-25.1: MatchesController#requireMatch rendered this 404 but
                // returned `undefined`, so the action ran anyway and wrote a
                // second response (ERR_HTTP_HEADERS_SENT, logged as a 500, plus
                // an unhandled rejection). The client only ever saw this 404;
                // stopping here removes the double write without changing the
                // wire.
                return renderNotFound();
            }

            switch (spec.level) {
                case 'view':
                    // getMatch: no further authorize() beyond authenticateRequest's
                    // (always-true) 'view'.
                    return null;

                case 'manage':
                    // postStartMatch / postEndMatch: authorize('manage', currentMatch).
                    // RoundsController#authenticateMatch: authorize('manage', ...) for
                    // EVERY rounds action.
                    await assertCan(subject, 'manage', { kind: 'match', match: state.currentMatch }, loaders);
                    return null;

                case 'pause':
                    // postPauseRound / postResumeRound. RoundsController#authenticateMatch
                    // authorizes 'manage' FIRST, then the action authorizes 'pause'
                    // (= manage || judge). The judge branch of 'pause' is therefore
                    // unreachable (F-11): judges get 401 here. Decision 2026-10-11:
                    // only the master may pause, so this is the intended behaviour.
                    // Both checks are kept, in order, so the effective rule is
                    // reproduced rather than re-derived.
                    await assertCan(subject, 'manage', { kind: 'match', match: state.currentMatch }, loaders);
                    await assertCan(subject, 'pause',  { kind: 'match', match: state.currentMatch }, loaders);
                    return null;

                case 'judge':
                    // RidingTimeVoteController#authenticateMatch: the open-round check
                    // comes BEFORE authorize('judge'), so a non-judge gets 400 (not
                    // 401) when there is no active round (pinned in the matrix).
                    if (!state.currentRound) return renderErrors({ matchId: ['no active round available'] });
                    await assertCan(subject, 'judge', { kind: 'match', match: state.currentMatch }, loaders);
                    return null;
            }
            break;
    }

    // Unreachable for a well-typed spec. Fail CLOSED.
    throw new AuthorizationError();
}

/** Express middleware: runs the gates; on a `Rendered` it responds and stops. */
export function authorizeMiddleware(db: DbOrTx, spec: AuthorizeSpec) {
    const loaders = repositoryLoaders(db);
    return async function authorizeRequest(_req: Request, res: Response, next: NextFunction): Promise<void> {
        const state = getRequestState(res);
        state.handling = true;
        let rendered: Rendered | null;
        try {
            rendered = await runGates(spec, state, loaders);
        } catch (err) {
            next(err);
            return;
        }
        if (rendered) {
            sendRendered(res, rendered);
            return;
        }
        next();
    };
}
