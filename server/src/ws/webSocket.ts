/**
 * A client socket, authenticated by the API token in the handshake's `auth`.
 * Clients follow a match by joining its room with `match.join`.
 *
 * The handshake and every event argument are client-supplied JSON, so the
 * lookups below accept `unknown` and reproduce how the Sequelize lookups they
 * replace treated each JSON type.
 */
import { inspect } from 'node:util';
import type { Logger } from 'pino';
import type { DbOrTx } from '../db/repositories/internal';
import { findMatchById } from '../db/repositories/matches';
import { findFirstUserWithApiTokenIn, findUserByApiToken } from '../db/repositories/users';
import type { Match, User } from '../db/types';
import { can, repositoryLoaders } from '../http/permissions';
import { AbstractWebSocket } from './abstractWebSocket';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger }: { logger: Logger } = require('../../lib/logger');

/**
 * The user an `auth.apiToken` value identifies. Sequelize compared a scalar
 * with `=`, turned an array into `IN (...)` (so `[token]` authenticates), and
 * refused any other object with `Invalid value <inspected value>`.
 */
export async function findUserForToken(db: DbOrTx, token: unknown): Promise<User | null> {
    if (Array.isArray(token)) {
        const values = (token as unknown[]).flat(Infinity);
        const invalid = values.find((value) => value !== null && typeof value === 'object');
        if (invalid !== undefined) throw new Error(`Invalid value ${inspect(invalid)}`);
        return await findFirstUserWithApiTokenIn(db, values.filter((value) => value !== null) as string[]);
    }
    if (token !== null && typeof token === 'object') throw new Error(`Invalid value ${inspect(token)}`);
    return await findUserByApiToken(db, token as string);
}

/**
 * The match a `match.join` argument names, with Sequelize `findByPk` rules:
 * `null`/`undefined` find nothing, a string or number is looked up, and
 * anything else throws.
 */
export async function findMatchForId(db: DbOrTx, matchId: unknown): Promise<Match | null> {
    if (matchId === null || matchId === undefined) return null;
    if (typeof matchId !== 'string' && typeof matchId !== 'number') {
        throw new Error(`Argument passed to findByPk is invalid: ${matchId}`);
    }
    return await findMatchById(db, matchId as string);
}

export class WebSocket extends AbstractWebSocket {
    #currentUser: User | null | undefined;

    async init(): Promise<void> {
        await super.init();

        await this.#initCurrentUser();
        if (!this.currentUser) {
            // During the handshake the socket is not connected yet, so this is
            // a no-op and the connection goes ahead without a user.
            this.close();
            return;
        }
    }

    addEventHandlers(): void {
        this.on('match.join',  this.handleMatchJoined.bind(this));
        this.on('match.leave', this.handleMatchLeft.bind(this));
    }

    async handleMatchJoined(matchId: unknown): Promise<void> {
        const match   = await findMatchForId(this.db, matchId);
        const allowed = await can({ user: this.currentUser, matCode: null }, 'view', { kind: 'match', match }, repositoryLoaders(this.db));
        if (!allowed) {
            logger.warn(`WS match.join denied: user=${this.currentUser?.id} match=${matchId} socket=${this.id}`);
            return;
        }

        // Throws for a socket without a user, as it always has.
        logger.info(`WS match.join: user=${this.currentUser.id} match=${matchId} socket=${this.id}`);
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
