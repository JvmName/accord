/**
 * A command refused because another caller got there first (the match has
 * already started, or already ended). Routes answer it with a 400.
 */
export class CommandRefused extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CommandRefused';
    }
}
