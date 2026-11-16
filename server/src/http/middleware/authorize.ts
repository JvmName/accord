/**
 * Authentication + authorization gates.
 *
 * SECURITY BOUNDARY. Each `AuthorizeSpec` variant expands to a fixed check
 * sequence, in a fixed order, because the order is observable: whichever check
 * fails first decides between 401, 404 and 400. Proven by
 * `test/http/authorizationParity.test.ts` (the authorization matrix, every
 * row, grants AND denies) and `test/http/permissions.test.ts`.
 *
 * A gate either passes (returns `null`), returns a `Rendered` (404 / 400), or
 * throws `AuthorizationError` (401).
 *
 * Viewing a mat or a match is unconditionally allowed for a non-null scope, so
 * those checks can never deny and are not repeated here.
 */
import type { NextFunction, Request, Response } from 'express';
import type { DbOrTx } from '../../db/repositories/internal';
import { Rendered, renderErrors, renderNotFound, renderUnauthorized, sendRendered } from '../envelope';
import { AuthorizationError } from '../errors';
import { can, repositoryLoaders, type ActionFor, type PermissionLoaders, type Scope, type Subject } from '../permissions';
import type { AuthorizeSpec } from '../types';
import { getRequestState, type RequestState } from './requestState';

/** Throws `AuthorizationError` when `subject` may not do `action` to `scope`. */
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
            // Unauthenticated BY DESIGN: a mat's page is public. A missing mat
            // is a 404.
            if (!state.currentMat) return renderNotFound();
            await assertCan(subject, 'view', { kind: 'mat', mat: state.currentMat }, loaders);
            return null;

        case 'matCode':
            switch (spec.level) {
                case 'public':
                    // `POST /mat/:matCode/join` takes no token. Its unknown-code
                    // 404 and its role-dependent assign/'be assigned judge' checks
                    // live in the handler (`addUser`), so nothing is checked here.
                    return null;

                case 'view':
                    // Authentication first (401), then the mat (404): an anonymous
                    // caller gets 401 whether or not the code exists.
                    if (!state.currentUser) return renderUnauthorized();
                    if (!state.currentMat) return renderNotFound();
                    return null;

                case 'create a match':
                    // 401 without a user, 404 for a missing mat, then both
                    // 'create a match' and 'assign' (identical checks: the
                    // request's mat code must be the ADMIN code OF THIS MAT;
                    // membership is irrelevant).
                    if (!state.currentUser) return renderUnauthorized();
                    if (!state.currentMat) return renderNotFound();
                    await assertCan(subject, 'create a match', { kind: 'mat', mat: state.currentMat }, loaders);
                    await assertCan(subject, 'assign',         { kind: 'mat', mat: state.currentMat }, loaders);
                    return null;
            }
            break;

        case 'match':
            // The common prefix of every match route: 401, then 404.
            if (!state.currentUser) return renderUnauthorized();
            if (!state.currentMatch) {
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
                    // unreachable: judges get 401 here. Decision 2026-10-11:
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
