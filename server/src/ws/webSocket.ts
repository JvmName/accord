/**
 * A client socket, authenticated by the API token in the handshake's `auth`.
 * Clients follow a match by joining its room with `match.join`.
 *
 * The handshake and every event argument are client-supplied JSON, so the
 * lookups below accept `unknown` and match nothing unless it is a string.
 */
import type { Logger } from 'pino';
import type { DbOrTx } from '../db/repositories/internal';
import { findMatchById } from '../db/repositories/matches';
import { findUserByApiToken } from '../db/repositories/users';
import type { Match, User } from '../db/types';
import { can, repositoryLoaders } from '../http/permissions';
import { AbstractWebSocket, SocketAuthError } from './abstractWebSocket';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger }: { logger: Logger } = require('../../lib/logger');

/** The user an `auth.apiToken` identifies. Only a non-empty string can; any other JSON type matches nobody. */
export async function findUserForToken(db: DbOrTx, token: unknown): Promise<User | null> {
    if (typeof token !== 'string' || token === '') return null;
    return await findUserByApiToken(db, token);
}

/** The match a `match.join` argument names: only a non-empty string can name one. */
export async function findMatchForId(db: DbOrTx, matchId: unknown): Promise<Match | null> {
    if (typeof matchId !== 'string' || matchId === '') return null;
    return await findMatchById(db, matchId);
}

export class WebSocket extends AbstractWebSocket {
    #currentUser: User | null | undefined;

    async init(): Promise<void> {
        await super.init();

        await this.#initCurrentUser();
        if (!this.currentUser) throw new SocketAuthError();
    }

    addEventHandlers(): void {
        this.on('match.join',  this.handleMatchJoined.bind(this));
        this.on('match.leave', this.handleMatchLeft.bind(this));
    }

    async handleMatchJoined(matchId: unknown): Promise<void> {
        const user = this.currentUser;
        const match = await findMatchForId(this.db, matchId);
        const allowed = user !== null && await can({ user, matCode: null }, 'view', { kind: 'match', match }, repositoryLoaders(this.db));
        if (!allowed) {
            logger.warn(`WS match.join denied: user=${user?.id} match=${String(matchId)} socket=${this.id}`);
            return;
        }

        logger.info(`WS match.join: user=${user.id} match=${String(matchId)} socket=${this.id}`);
        this.join(this.roomForMatch(matchId));
    }

    handleMatchLeft(matchId: unknown): void {
        logger.info(`WS match.leave: user=${this.currentUser?.id} match=${matchId} socket=${this.id}`);
        this.leave(this.roomForMatch(matchId));
    }

    async #initCurrentUser(): Promise<void> {
        if (!this.apiToken) return;

        this.#currentUser = await findUserForToken(this.db, this.apiToken);
    }

    get currentUser(): User | null { return this.#currentUser || null; }
}
