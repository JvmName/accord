/**
 * The process environment, parsed and validated in one place.
 *
 * `loadConfig()` reads the environment when it is called, never at import
 * time, so tests can change variables between calls. The entrypoints call it
 * first thing, so a bad value stops the process at boot with a message naming
 * the variable.
 */
import { z } from 'zod';

const flag = z.enum(['0', '1']).optional();

const EnvSchema = z.object({
    NODE_ENV:                z.string().min(1).default('development'),
    PORT:                    z.coerce.number().int().min(1).max(65535).default(3000),
    HOST:                    z.string().min(1).default('localhost'),
    /** SQLite file; unset means `config/db/database.<NODE_ENV>.sqlite` under the working directory. */
    DATABASE_PATH:           z.string().min(1).optional(),
    /** Origin of the production web client, added to the CORS allow-list. */
    WEB_ORIGIN:              z.string().url().optional(),
    /** Shared secret between the web process and its worker; the web process makes one up when unset. */
    WORKER_TOKEN:            z.string().min(1).optional(),
    LOG_LEVEL:               z.string().min(1).transform(level => level.toLowerCase()).default('info'),
    PROC_NAME:               z.string().min(1).default('SERVER'),
    ACCORD_VALIDATE_WIRE:    flag,
    ACCORD_OPENAPI_VALIDATION: flag,
});

export type Config = z.infer<typeof EnvSchema>;

/** Thrown by `loadConfig` with every invalid variable listed. */
export class ConfigError extends Error {
    constructor(readonly issues: { variable: string; message: string }[]) {
        super(`Invalid environment configuration:\n${issues.map(issue => `  ${issue.variable}: ${issue.message}`).join('\n')}`);
        this.name = 'ConfigError';
    }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    // An empty variable (`PORT=`) counts as unset.
    const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ''));
    const result  = EnvSchema.safeParse(present);
    if (result.success) return result.data;
    throw new ConfigError(result.error.issues.map(issue => ({
        variable: String(issue.path[0] ?? ''),
        message:  issue.message,
    })));
}

/** `loadConfig` for entrypoints: print the problem on one screen and exit, instead of a stack trace. */
export function loadConfigOrExit(env: NodeJS.ProcessEnv = process.env): Config {
    try {
        return loadConfig(env);
    } catch (err) {
        if (!(err instanceof ConfigError)) throw err;
        console.error(err.message);
        process.exit(1);
    }
}
