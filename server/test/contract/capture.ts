/**
 * Golden-file capture harness for the live API contract.
 *
 * WHAT THIS IS
 * ------------
 * `runAll()` boots a real `ApplicationServer` against a throwaway SQLite
 * database, seeds the deterministic fixture graph from `seed.ts`, then drives
 * every HTTP route and every WebSocket event and records the exact wire bytes.
 *
 * Two callers share it, and that sharing is the point:
 *   - `capture.test.js`  — writes `goldens/*.json` (only with CAPTURE_GOLDENS=1)
 *                          and runs the completeness oracle.
 *   - `contract.test.js` — runs the same plan and asserts byte-equality with
 *                          the committed goldens. This is the migration gate.
 * Because both execute the identical ordered plan, replay determinism is
 * structural rather than hoped for.
 *
 * DETERMINISM
 * -----------
 * The wall clock is frozen (`jest.setSystemTime`) for the entire run, and every
 * fixture has a fixed UUID. That means timestamps, `time_remaining`,
 * `break_remaining` and riding-time `score` are all *asserted literally* rather
 * than masked — the goldens protect the computed values, not just the keys.
 * Only identifiers the server generates during the run (a new user's id and
 * `api_token`, a generated mat code) are placeholdered, positionally.
 *
 * NULL vs ABSENT
 * --------------
 * Never normalized, in either direction. `models_ext.kt`'s `Match.merge()`
 * exists precisely because some endpoints return partial payloads, where an
 * absent key means "keep the cached value" and `null` means "genuinely empty".
 * Collapsing the two would silently delete that distinction from the contract.
 * Capture therefore parses the raw response text and stores exactly the keys
 * that were on the wire.
 *
 * NODE_ENV
 * --------
 * Captured with `CONSTANTS.DEV === false`, which is what production runs.
 * `/docs`, `/docs.json` and `/async-docs.json` are registered only when
 * `NODE_ENV === 'development'`, so their goldens record the 404 that real
 * clients get. See INTENTIONALLY_UNCOVERED below.
 */

import * as fs   from 'fs';
import * as path from 'path';

const Http = require('../helpers/httpServer');


export const GOLDENS_DIR = path.join(__dirname, 'goldens');
export const ROUTE_TABLE = path.join(
    __dirname, '..', '..', '..', '.ai', 'plans', 'server-ts', 'artifacts', 'route-table.txt',
);


/**
 * Routes whose *documented* behaviour is captured but whose DEV-only behaviour
 * deliberately is not. The harness prints this table, so an entry is a visible
 * decision rather than a silent hole.
 */
export const INTENTIONALLY_UNCOVERED: Record<string, string> = {
    'GET /docs':
        'DEV-only (ApplicationServer#registerDefaultControllers gates DocsController on CONSTANTS.DEV). '
        + 'Serves a static Swagger/AsyncAPI HTML shell, is not part of the Kotlin client contract '
        + '(absent from AccordClient.kt), and does not exist in production. Its production behaviour '
        + '(404) IS captured.',
    'GET /docs.json':
        'DEV-only, same gate. The body is the GENERATED OpenAPI spec, which task 06 replaces on purpose; '
        + 'byte-locking it here would create a gate that a later task is required to break. '
        + 'Its production behaviour (404) IS captured.',
    'GET /async-docs.json':
        'DEV-only, same gate and same reasoning as /docs.json for the AsyncAPI spec.',
};


// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAT_CODE_RE = /^[a-z_]+\.[a-z_]+\.[a-z_]+$/i;


/** Per-record allocator for identifiers the server invented during the run. */
class DynamicNames {
    #assigned = new Map<string, string>();
    #counts: Record<string, number> = {};

    for(kind: string, raw: string): string {
        const existing = this.#assigned.get(raw);
        if (existing) return existing;
        this.#counts[kind] = (this.#counts[kind] || 0) + 1;
        const name = `<${kind}:${this.#counts[kind]}>`;
        this.#assigned.set(raw, name);
        return name;
    }
}


function buildStaticNames(): Map<string, string> {
    const { IDS, CODES } = require('./seed.ts');
    const map = new Map<string, string>();
    for (const [name, value] of Object.entries(IDS))   map.set(String(value), `<${name}>`);
    for (const [name, value] of Object.entries(CODES)) map.set(String(value), `<${name}>`);
    return map;
}


function replaceString(raw: string, statics: Map<string, string>, dyn: DynamicNames): string {
    const known = statics.get(raw);
    if (known) return known;
    if (UUID_RE.test(raw))     return dyn.for('uuid', raw);
    if (MAT_CODE_RE.test(raw)) return dyn.for('code', raw);
    return raw;
}


/** Replaces every fixture identifier embedded in a URL path or free text. */
function replaceInPath(raw: string, statics: Map<string, string>, dyn: DynamicNames): string {
    return raw
        .split('/')
        .map(segment => {
            const [head, ...query] = segment.split('?');
            const replaced = replaceString(head, statics, dyn);
            return query.length ? [replaced, ...query].join('?') : replaced;
        })
        .join('/');
}


/**
 * Canonicalises a parsed JSON value for storage.
 *
 * Object keys are sorted so a harmless reordering in the server can't redden
 * the gate, and so diffs read top-to-bottom. `null` is a value like any other
 * and survives; an absent key stays absent because it was never in the parsed
 * object to begin with.
 */
function normalizeValue(value: any, statics: Map<string, string>, dyn: DynamicNames): any {
    if (value === null || typeof value !== 'object') {
        return typeof value === 'string' ? replaceString(value, statics, dyn) : value;
    }
    if (Array.isArray(value)) {
        return value.map(item => normalizeValue(item, statics, dyn));
    }

    // Sort on the RAW key first so the traversal (and therefore dynamic
    // placeholder allocation) is order-independent, then re-sort on the
    // normalized key so the stored file reads in placeholder order.
    const out: Record<string, any> = {};
    const entries = Object.keys(value)
        .sort()
        .map(key => [replaceString(key, statics, dyn), normalizeValue(value[key], statics, dyn)] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    for (const [key, val] of entries) out[key] = val;
    return out;
}


// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

interface HttpResult {
    status: number;
    contentType: string | null;
    text: string;
}

function makeRawClient(origin: string) {
    return async function request(method: string, routePath: string,
                                  opts: { token?: string; body?: any } = {}): Promise<HttpResult> {
        const init: RequestInit = { method, headers: {} };
        const headers = init.headers as Record<string, string>;

        if (opts.token) headers['x-api-token'] = opts.token;
        if (opts.body !== undefined) {
            headers['content-type'] = 'application/json';
            (init as any).body = JSON.stringify(opts.body);
        }

        const res = await fetch(`${origin}${routePath}`, init);
        return {
            status:      res.status,
            contentType: res.headers.get('content-type'),
            text:        await res.text(),
        };
    };
}


// ---------------------------------------------------------------------------
// The capture run
// ---------------------------------------------------------------------------

export interface Record_ {
    /** Golden file base name. */
    name: string;
    /** `METHOD /path` exactly as it appears in artifacts/route-table.txt. */
    route: string | null;
    /** What this case is here to prove. Stored in the golden. */
    why: string;
    body: any;
}

export interface CaptureResult {
    records: Record_[];
    /** route -> golden names that exercised it. */
    routeCoverage: Map<string, string[]>;
}


export interface Clock { set(ms: number): void; }


export async function runAll(clock: Clock): Promise<CaptureResult> {
    const { seed, IDS, CODES, NOW } = require('./seed.ts');

    const statics = buildStaticNames();
    const records: Record_[] = [];
    const routeCoverage = new Map<string, string[]>();

    await Http.migrate();
    const fixtures = await seed(clock);

    const { server, origin, port } = await Http.startServer();
    const request = makeRawClient(origin);

    const TOKENS: Record<string, string> = {
        creator:  IDS['token:creator'],
        judgeA:   IDS['token:judgeA'],
        judgeB:   IDS['token:judgeB'],
        viewer:   IDS['token:viewer'],
        outsider: IDS['token:outsider'],
        joiner:   IDS['token:joiner'],
    };

    function push(name: string, route: string | null, why: string, body: any) {
        records.push({ name, route, why, body });
        if (route) {
            if (!routeCoverage.has(route)) routeCoverage.set(route, []);
            routeCoverage.get(route)!.push(name);
        }
    }

    /** Issues one request and records the normalized request/response pair. */
    async function http(name: string, route: string | null, why: string,
                        method: string, routePath: string,
                        opts: { as?: string; body?: any } = {}) {
        const token = opts.as ? TOKENS[opts.as] : undefined;
        const res   = await request(method, routePath, { token, body: opts.body });
        const dyn   = new DynamicNames();

        let parsed: any;
        try { parsed = res.text === '' ? null : JSON.parse(res.text); }
        catch { parsed = { '<non-json-text>': res.text.length }; }

        push(name, route, why, {
            request: {
                method,
                path: replaceInPath(routePath, statics, dyn),
                // `as` is the semantic identity of the x-api-token header, not
                // the token itself — tokens are fixtures, identities are contract.
                as:   opts.as ?? null,
                body: opts.body === undefined ? null : normalizeValue(opts.body, statics, dyn),
            },
            response: {
                status:       res.status,
                content_type: res.contentType,
                body:         normalizeValue(parsed, statics, dyn),
            },
        });
    }

    try {
        // =====================================================================
        // Infrastructure routes
        // =====================================================================
        await http('http.root', 'GET /',
                   'Version banner. Confirms the {data,status} envelope wraps bare strings too.',
                   'GET', '/');

        await http('http.healthCheck', 'GET /system/healthCheck',
                   'Liveness probe: an empty object inside the envelope, not a null.',
                   'GET', '/system/healthCheck');

        // DEV-only routes. What production actually serves is a 404, and that
        // is the contract a deployed client would meet.
        await http('http.docs.notFound', 'GET /docs',
                   'DocsController is registered only when CONSTANTS.DEV; this pins the production 404.',
                   'GET', '/docs');
        await http('http.docsJson.notFound', 'GET /docs.json',
                   'DEV-only route; pins the production 404. See INTENTIONALLY_UNCOVERED.',
                   'GET', '/docs.json');
        await http('http.asyncDocsJson.notFound', 'GET /async-docs.json',
                   'DEV-only route; pins the production 404. See INTENTIONALLY_UNCOVERED.',
                   'GET', '/async-docs.json');

        // =====================================================================
        // POST /users
        // =====================================================================
        await http('http.users.create.success', 'POST /users',
                   'Registration. The only endpoint that returns a raw api_token alongside a user; '
                   + 'CreateUserResponse in models.kt depends on both keys.',
                   'POST', '/users', { body: { name: 'Newly Registered' } });

        await http('http.users.create.missingName.400', 'POST /users',
                   'Validation envelope: ValidationError -> 400 {data:{errors:{field:[msg]}},status:"bad request"}. '
                   + 'This is the shape ApiResult.Error(Map<String,List<String>>) decodes.',
                   'POST', '/users', { body: {} });

        // =====================================================================
        // POST /mats
        // =====================================================================
        await http('http.users.create.objectName.500', 'POST /users',
                   'The generic 500 branch of ApplicationServer#handleError: NOT an `errors` map but '
                   + '{data:{error:"<raw message>"},status:"server error"}. ApiResultSerializer.kt has a '
                   + 'separate `error` branch for exactly this shape. Note it leaks the raw driver message.',
                   'POST', '/users', { body: { name: { nested: true } } });

        await http('http.mats.create.success', 'POST /mats',
                   'Mat creation renders includeCodes + includeMatJudges, so `codes` is populated here '
                   + 'and nowhere else. Both generated codes are placeholdered positionally.',
                   'POST', '/mats', { as: 'creator', body: { name: 'Created Mat', judge_count: 3 } });

        await http('http.mats.create.unauthenticated.401', 'POST /mats',
                   'No x-api-token: AuthorizationError -> 401 {data:null,status:"unauthorized"}. '
                   + 'Note `data` is null, not an errors object.',
                   'POST', '/mats', { body: { name: 'Nope' } });

        await http('http.mats.create.missingName.400', 'POST /mats',
                   '400 validation on an authenticated route.',
                   'POST', '/mats', { as: 'creator', body: {} });

        // =====================================================================
        // GET /mat/{matId}
        // =====================================================================
        await http('http.mat.get.byId', 'GET /mat/{matId}',
                   'The full mat read: judges + current_match + upcoming_matches. current_match is the '
                   + 'earliest started incomplete match; note it carries NO rounds/judges/mat of its own.',
                   'GET', `/mat/${IDS['mat:main']}`, { as: 'creator' });

        await http('http.mat.get.byId.anonymous', 'GET /mat/{matId}',
                   'FINDINGS F-15: MatsController registers no authenticateRequest and matPermission("view") '
                   + 'is unconditionally true, so an anonymous caller gets the full payload. Pinned as-is.',
                   'GET', `/mat/${IDS['mat:main']}`);

        await http('http.mat.get.byCode', 'GET /mat/{matId}',
                   'The :matId segment doubles as a mat code when it matches MatCode.CODE_REGEXP '
                   + '(FINDINGS F-12). Same payload as by-id.',
                   'GET', `/mat/${CODES['code:main-viewer']}`, { as: 'creator' });

        await http('http.mat.get.empty', 'GET /mat/{matId}',
                   'A mat with no judges and no matches: judges [], current_match null, upcoming_matches []. '
                   + 'Proves the empty shapes are null/[] rather than absent. Also shows judge_count '
                   + 'defaulting to 1 when creation omitted it.',
                   'GET', `/mat/${IDS['mat:empty']}`, { as: 'creator' });

        await http('http.mat.get.unknownId.401', 'GET /mat/{matId}',
                   'FINDINGS F-16: an unknown mat is reported as 401, not 404, because Authorizer#can '
                   + 'returns false for a null scope. Sibling "not found" routes return 404. Pinned as-is.',
                   'GET', `/mat/${'11111111-2222-4333-8444-555555555555'}`, { as: 'creator' });

        // =====================================================================
        // GET /mat/{matCode}/judges and /viewers
        // =====================================================================
        await http('http.mat.judges.success', 'GET /mat/{matCode}/judges',
                   'Bare user list, no envelope nesting beyond {data:{judges:[...]}}. api_token is '
                   + 'stripped by User#apiSafeKeys — its absence here is contract.',
                   'GET', `/mat/${CODES['code:main-admin']}/judges`, { as: 'creator' });

        await http('http.mat.judges.unknownCode.404', 'GET /mat/{matCode}/judges',
                   'Mat-scoped UsersController#authenticateRequest renders 404 when the code resolves to '
                   + 'no mat — contrast the 401 on GET /mat/{matId} (F-16).',
                   'GET', '/mat/no.such.code/judges', { as: 'creator' });

        await http('http.mat.judges.unauthenticated.401', 'GET /mat/{matCode}/judges',
                   'Unlike GET /mat/{matId}, the mat-scoped user routes DO authenticate.',
                   'GET', `/mat/${CODES['code:main-admin']}/judges`);

        await http('http.mat.viewers.success', 'GET /mat/{matCode}/viewers',
                   'Viewer roster. Distinct key (`viewers`) from the judges route.',
                   'GET', `/mat/${CODES['code:main-viewer']}/viewers`, { as: 'creator' });

        await http('http.mat.viewers.unknownCode.404', 'GET /mat/{matCode}/viewers',
                   '404 path for the viewers route.',
                   'GET', '/mat/no.such.code/viewers', { as: 'creator' });

        // =====================================================================
        // POST/DELETE /mat/{matCode}/join   (on mat:join, so mat:main stays stable)
        // =====================================================================
        await http('http.mat.join.viewerCode.anonymous', 'POST /mat/{matCode}/join',
                   'Join is the one authenticated-optional route: with no token it CREATES a user and '
                   + 'returns a fresh api_token. JoinMatResult in models.kt needs mat+user+api_token.',
                   'POST', `/mat/${CODES['code:join-viewer']}/join`, { body: { name: 'Walk In' } });

        await http('http.mat.join.viewerCode.noName.anonymous', 'POST /mat/{matCode}/join',
                   'Omitting `name` defaults the created user to "Anonymous".',
                   'POST', `/mat/${CODES['code:join-viewer']}/join`, { body: {} });

        await http('http.mat.join.adminCode.existingUser', 'POST /mat/{matCode}/join',
                   'Joining with an admin code adds the caller to the mat judges.',
                   'POST', `/mat/${CODES['code:join-admin']}/join`, { as: 'joiner' });

        await http('http.mat.join.alreadyViewer.400', 'POST /mat/{matCode}/join',
                   'Re-joining as a viewer is a 400 with a matCode-keyed error.',
                   'POST', `/mat/${CODES['code:join-viewer']}/join`, { as: 'viewer' });

        await http('http.mat.join.unknownCode.404', 'POST /mat/{matCode}/join',
                   'Unknown code on the unauthenticated join path -> 404 with an errors object '
                   + '(not the null-data 404 of renderNotFoundResponse).',
                   'POST', '/mat/no.such.code/join', { body: { name: 'X' } });

        await http('http.mat.join.soloMatchInProgress.400', 'POST /mat/{matCode}/join',
                   'Joining as a judge while the mat has a live match with exactly ONE judge is '
                   + 'refused: a second judge mid-match would change the consensus threshold from '
                   + '1 to 2 and silently rewrite the running score.',
                   'POST', `/mat/${CODES['code:solo-admin']}/join`, { as: 'outsider' });

        await http('http.mat.leave.judgeMidMatch', 'DELETE /mat/{matCode}/join',
                   'Leaving as a judge while a round is live: the judge\'s OPEN riding-time vote is '
                   + 'closed and they are dropped from the match judges as well as the mat.',
                   'DELETE', `/mat/${CODES['code:solo-admin']}/join`, { as: 'judgeA' });

        await http('http.mat.leave.judge', 'DELETE /mat/{matCode}/join',
                   'Leaving via the admin code removes the caller as a judge and returns the updated mat.',
                   'DELETE', `/mat/${CODES['code:join-admin']}/join`, { as: 'joiner' });

        await http('http.mat.leave.viewer', 'DELETE /mat/{matCode}/join',
                   'Leaving via the viewer code removes the caller as a viewer.',
                   'DELETE', `/mat/${CODES['code:join-viewer']}/join`, { as: 'viewer' });

        // =====================================================================
        // POST /mat/{matCode}/matches
        // =====================================================================
        await http('http.matches.create.byName', 'POST /mat/{matCode}/matches',
                   'Match creation with new competitors by name. Renders includeMat ONLY — no judges, '
                   + 'no rounds. This is a PARTIAL payload, which is why models_ext.kt has merge().',
                   'POST', `/mat/${CODES['code:main-admin']}/matches`,
                   { as: 'creator', body: { red: { name: 'Fresh Red' }, blue: { name: 'Fresh Blue' } } });

        await http('http.matches.create.byId', 'POST /mat/{matCode}/matches',
                   'Match creation reusing existing users by id.',
                   'POST', `/mat/${CODES['code:flow-admin']}/matches`,
                   { as: 'creator', body: { red: { id: IDS['user:red'] }, blue: { id: IDS['user:blue'] } } });

        await http('http.matches.create.missingCompetitors.400', 'POST /mat/{matCode}/matches',
                   'Four error keys in one envelope (red.id, red.name, blue.id, blue.name) — the '
                   + 'multi-key case for Map<String,List<String>>.',
                   'POST', `/mat/${CODES['code:main-admin']}/matches`, { as: 'creator', body: {} });

        await http('http.matches.create.viewerCode.401', 'POST /mat/{matCode}/matches',
                   'A viewer code is not an admin code: "create a match" is denied -> 401.',
                   'POST', `/mat/${CODES['code:main-viewer']}/matches`,
                   { as: 'creator', body: { red: { name: 'a' }, blue: { name: 'b' } } });

        // =====================================================================
        // GET /match/{matchId} — one per round state
        // =====================================================================
        await http('http.match.get.ended', 'GET /match/{matchId}',
                   'The richest read in the API: an ended match with three ended rounds covering '
                   + 'points / submission / stoppage, plus a non-null Match.winner. Every RoundResultType '
                   + 'except tie and tech-fall appears here.',
                   'GET', `/match/${IDS['match:done']}`, { as: 'creator' });

        await http('http.match.get.techFall', 'GET /match/{matchId}',
                   'result.method.type === "tech-fall" with value = the winning score as a STRING. '
                   + 'The hyphen matters: RoundResultType in models.kt maps @SerialName("tech-fall").',
                   'GET', `/match/${IDS['match:techfall']}`, { as: 'creator' });

        await http('http.match.get.tie', 'GET /match/{matchId}',
                   'A 0-0 ended round: winner null, method.type "tie", value "0". Proves a null winner '
                   + 'on an ended round is a legal draw, not a missing field.',
                   'GET', `/match/${IDS['match:tie']}`, { as: 'creator' });

        await http('http.match.get.openRound', 'GET /match/{matchId}',
                   'A round IN PROGRESS: ended_at null, non-null time_remaining, live riding-time score '
                   + 'from open votes, and method {type:null,value:null}. Also has a completed pause, '
                   + 'so paused is false.',
                   'GET', `/match/${IDS['match:open']}`, { as: 'creator' });

        await http('http.match.get.pausedRound', 'GET /match/{matchId}',
                   'paused: true, from an unresolved RoundPause. time_remaining freezes at the pause '
                   + 'instant rather than tracking the clock.',
                   'GET', `/match/${IDS['match:paused']}`, { as: 'creator' });

        await http('http.match.get.inBreak', 'GET /match/{matchId}',
                   'CRITICAL: break_remaining is NON-NULL over plain HTTP during a break. '
                   + 'See FINDINGS F-20 — the plan documents this field as WebSocket-only, which is wrong.',
                   'GET', `/match/${IDS['match:break']}`, { as: 'creator' });

        await http('http.match.get.notStarted', 'GET /match/{matchId}',
                   'A created-but-unstarted match: started_at null, rounds [].',
                   'GET', `/match/${IDS['match:upcoming']}`, { as: 'creator' });

        await http('http.match.get.asViewer', 'GET /match/{matchId}',
                   'Per-role variant: matchPermission("view") is unconditionally true, so a plain mat '
                   + 'viewer sees byte-identical content to the manager. Two roles, one shape.',
                   'GET', `/match/${IDS['match:done']}`, { as: 'viewer' });

        await http('http.match.get.asOutsider', 'GET /match/{matchId}',
                   'Per-role variant: even a user with no relationship to the mat sees the full match.',
                   'GET', `/match/${IDS['match:done']}`, { as: 'outsider' });

        await http('http.match.get.unknownId.404', 'GET /match/{matchId}',
                   'requireMatch -> renderNotFoundResponse -> 404 {data:null,status:"not found"}.',
                   'GET', '/match/11111111-2222-4333-8444-666666666666', { as: 'creator' });

        await http('http.match.get.unauthenticated.401', 'GET /match/{matchId}',
                   'Match routes authenticate; contrast GET /mat/{matId} (F-15).',
                   'GET', `/match/${IDS['match:done']}`);

        // =====================================================================
        // POST /match/{matchId}/start
        // =====================================================================
        await http('http.match.start.success', 'POST /match/{matchId}/start',
                   'Starting a match copies the mat judges onto the match and opens round 1. '
                   + 'Renders mat + judges + rounds.',
                   'POST', `/match/${IDS['match:toStart']}/start`, { as: 'creator' });

        await http('http.match.start.alreadyStarted.400', 'POST /match/{matchId}/start',
                   'renderErrors default status is 400 with status text "bad request".',
                   'POST', `/match/${IDS['match:toStart']}/start`, { as: 'creator' });

        await http('http.match.start.asJudge.401', 'POST /match/{matchId}/start',
                   'Per-role deny: "manage" is mat-creator only, so a match judge is refused.',
                   'POST', `/match/${IDS['match:notStarted']}/start`, { as: 'judgeA' });

        // =====================================================================
        // POST /match/{matchId}/end
        // =====================================================================
        await http('http.match.end.notStarted.400', 'POST /match/{matchId}/end',
                   'Ending an unstarted match is a 400 keyed on matchId.',
                   'POST', `/match/${IDS['match:notStarted']}/end`, { as: 'creator' });

        await http('http.match.end.success', 'POST /match/{matchId}/end',
                   'Ending clears break_started_at/break_duration and closes the open round.',
                   'POST', `/match/${IDS['match:toEnd']}/end`, { as: 'creator' });

        await http('http.match.end.alreadyEnded.400', 'POST /match/{matchId}/end',
                   'The second 400 branch of postEndMatch.',
                   'POST', `/match/${IDS['match:toEnd']}/end`, { as: 'creator' });

        // =====================================================================
        // POST /match/{matchId}/rounds
        // =====================================================================
        await http('http.rounds.start.success', 'POST /match/{matchId}/rounds',
                   'Manually starting the next round during a break.',
                   'POST', `/match/${IDS['match:toStartRound']}/rounds`, { as: 'creator' });

        await http('http.rounds.start.activeRound.400', 'POST /match/{matchId}/rounds',
                   'Model-thrown Error is caught by the controller and rendered as a 400, NOT a 500.',
                   'POST', `/match/${IDS['match:toStartRound']}/rounds`, { as: 'creator' });

        await http('http.rounds.start.asJudge.401', 'POST /match/{matchId}/rounds',
                   'RoundsController#authenticateMatch authorizes "manage" for EVERY action, so judges '
                   + 'are refused on all round routes.',
                   'POST', `/match/${IDS['match:toStartRound']}/rounds`, { as: 'judgeA' });

        await http('http.rounds.start.unknownMatch.404', 'POST /match/{matchId}/rounds',
                   'authenticateMatch renders 404 before authorizing.',
                   'POST', '/match/11111111-2222-4333-8444-777777777777/rounds', { as: 'creator' });

        // =====================================================================
        // POST /match/{matchId}/rounds/end
        // =====================================================================
        await http('http.rounds.end.success', 'POST /match/{matchId}/rounds/end',
                   'Step 1 of the two-step end-round flow: stops the clock and starts the break. '
                   + 'The response already carries break_started_at, break_duration and break_remaining.',
                   'POST', `/match/${IDS['match:toEndRound']}/rounds/end`, { as: 'creator' });

        await http('http.rounds.end.noOpenRound.400', 'POST /match/{matchId}/rounds/end',
                   '"No available round to end" rendered as 400.',
                   'POST', `/match/${IDS['match:toEndRound']}/rounds/end`, { as: 'creator' });

        // =====================================================================
        // PATCH /match/{matchId}/rounds/result
        // =====================================================================
        await http('http.rounds.result.submission', 'PATCH /match/{matchId}/rounds/result',
                   'Step 2 of the end-round flow. winner + stoppage:false yields method.type '
                   + '"submission" with a NULL value.',
                   'PATCH', `/match/${IDS['match:toSubmission']}/rounds/result`,
                   { as: 'creator', body: { winner: 'red', stoppage: false } });

        await http('http.rounds.result.stoppage', 'PATCH /match/{matchId}/rounds/result',
                   'winner + stoppage:true yields method.type "stoppage", also with a null value.',
                   'PATCH', `/match/${IDS['match:toStoppage']}/rounds/result`,
                   { as: 'creator', body: { winner: 'blue', stoppage: true } });

        await http('http.rounds.result.explicitNull.400', 'PATCH /match/{matchId}/rounds/result',
                   'FINDINGS F-24: an EXPLICIT `winner: null` is REJECTED with 400. The validation '
                   + 'enum is [undefined, "red", "blue"], so only an OMITTED winner clears a result, '
                   + 'even though README/CLAUDE.md document the body as {winner: "red"|"blue"|null}. '
                   + 'The Kotlin client is unaffected only because kotlinx.serialization omits '
                   + 'default-valued nulls (encodeDefaults is false).',
                   'PATCH', `/match/${IDS['match:toClearResult']}/rounds/result`,
                   { as: 'creator', body: { winner: null, stoppage: false } });

        await http('http.rounds.result.clear', 'PATCH /match/{matchId}/rounds/result',
                   'OMITTING winner is what actually clears a previously declared result: the round '
                   + 'falls back to its score-derived method (here a 0-0 tie). This is the shape the '
                   + 'Kotlin client really sends for "no winner".',
                   'PATCH', `/match/${IDS['match:toClearResult']}/rounds/result`,
                   { as: 'creator', body: { stoppage: false } });

        await http('http.rounds.result.invalidWinner.400', 'PATCH /match/{matchId}/rounds/result',
                   'isEnum validation. The message lists only the truthy enum members because '
                   + 'validateIsEnum filters falsy values out of the message.',
                   'PATCH', `/match/${IDS['match:toSubmission']}/rounds/result`,
                   { as: 'creator', body: { winner: 'green' } });

        await http('http.rounds.result.windowClosed.422', 'PATCH /match/{matchId}/rounds/result',
                   'FINDINGS F-21: renderErrors(…, 422) produces an envelope with NO `status` key at all, '
                   + 'because ServerController#statusText has no 422 case. ApiResultSerializer.kt throws '
                   + 'SerializationException on a missing status. Pinned as-is.',
                   'PATCH', `/match/${IDS['match:open']}/rounds/result`,
                   { as: 'creator', body: { winner: 'red', stoppage: false } });

        await http('http.rounds.result.noEndedRound.422', 'PATCH /match/{matchId}/rounds/result',
                   'The other 422 branch: the result window is open (a break is running) but the '
                   + 'match has no ended round to attach a result to.',
                   'PATCH', `/match/${IDS['match:breakNoRounds']}/rounds/result`,
                   { as: 'creator', body: { winner: 'red', stoppage: false } });

        // =====================================================================
        // POST /match/{matchId}/rounds/pause and /resume
        // =====================================================================
        await http('http.rounds.resume.notPaused.400', 'POST /match/{matchId}/rounds/resume',
                   'Resuming a round that is running (not paused) reaches Round#resume\'s throw, '
                   + 'which the controller renders as a 400 rather than the 422 used for '
                   + '"no active round".',
                   'POST', `/match/${IDS['match:toPause']}/rounds/resume`, { as: 'creator' });

        await http('http.rounds.pause.success', 'POST /match/{matchId}/rounds/pause',
                   'Pausing sets paused:true and freezes time_remaining at the pause instant.',
                   'POST', `/match/${IDS['match:toPause']}/rounds/pause`, { as: 'creator' });

        await http('http.rounds.pause.alreadyPaused.400', 'POST /match/{matchId}/rounds/pause',
                   'Pausing twice reaches Round#pause\'s throw — again a 400, not a 422.',
                   'POST', `/match/${IDS['match:toPause']}/rounds/pause`, { as: 'creator' });

        await http('http.rounds.resume.success', 'POST /match/{matchId}/rounds/resume',
                   'Resuming clears paused and resumes the clock.',
                   'POST', `/match/${IDS['match:toPause']}/rounds/resume`, { as: 'creator' });

        await http('http.rounds.pause.asJudge.401', 'POST /match/{matchId}/rounds/pause',
                   'FINDINGS F-11: the `pause` permission grants judges access, but authenticateMatch '
                   + 'demands `manage` first, so the judge branch is unreachable over HTTP. Pinned as-is.',
                   'POST', `/match/${IDS['match:toPause']}/rounds/pause`, { as: 'judgeA' });

        await http('http.rounds.pause.noActiveRound.422', 'POST /match/{matchId}/rounds/pause',
                   'The second status-less 422 envelope (F-21).',
                   'POST', `/match/${IDS['match:notStarted']}/rounds/pause`, { as: 'creator' });

        await http('http.rounds.resume.noActiveRound.422', 'POST /match/{matchId}/rounds/resume',
                   'Resume\'s 422 branch.',
                   'POST', `/match/${IDS['match:notStarted']}/rounds/resume`, { as: 'creator' });

        // =====================================================================
        // POST/DELETE /match/{matchId}/ridingTime
        // =====================================================================
        await http('http.ridingTime.start.success', 'POST /match/{matchId}/ridingTime',
                   'A judge opens a riding-time vote. With two judges the consensus threshold is 2, so '
                   + 'one vote alone leaves the score at 0 — that zero is the contract.',
                   'POST', `/match/${IDS['match:toVote']}/ridingTime`,
                   { as: 'judgeA', body: { rider: 'red' } });

        await http('http.ridingTime.start.secondJudge', 'POST /match/{matchId}/ridingTime',
                   'The second judge reaching the threshold. Control time starts accruing from here.',
                   'POST', `/match/${IDS['match:toVote']}/ridingTime`,
                   { as: 'judgeB', body: { rider: 'red' } });

        await http('http.ridingTime.start.alreadyActive.400', 'POST /match/{matchId}/ridingTime',
                   '"Riding time is already active" from the model, rendered 400.',
                   'POST', `/match/${IDS['match:toVote']}/ridingTime`,
                   { as: 'judgeA', body: { rider: 'blue' } });

        await http('http.ridingTime.start.invalidRider.400', 'POST /match/{matchId}/ridingTime',
                   'isEnum validation on `rider`.',
                   'POST', `/match/${IDS['match:toVote']}/ridingTime`,
                   { as: 'judgeA', body: { rider: 'purple' } });

        await http('http.ridingTime.start.asNonJudge.401', 'POST /match/{matchId}/ridingTime',
                   'Per-role deny: the ridingTime controller authorizes "judge", so the mat CREATOR '
                   + '(who manages everything else) is refused here unless they are also a judge. '
                   + 'This is the one route where manager < judge.',
                   'POST', `/match/${IDS['match:toVote']}/ridingTime`,
                   { as: 'outsider', body: { rider: 'red' } });

        await http('http.ridingTime.end.success', 'DELETE /match/{matchId}/ridingTime',
                   'Closing a vote drops back below the threshold and banks the control period.',
                   'DELETE', `/match/${IDS['match:toVote']}/ridingTime?rider=red`, { as: 'judgeA' });

        await http('http.ridingTime.end.notActive.400', 'DELETE /match/{matchId}/ridingTime',
                   '"Riding time is not active" rendered 400.',
                   'DELETE', `/match/${IDS['match:toVote']}/ridingTime?rider=red`, { as: 'judgeA' });

        await http('http.ridingTime.end.noOpenRound.400', 'DELETE /match/{matchId}/ridingTime',
                   'RidingTimeVoteController#authenticateMatch rejects with a 400 (not 404/401) when the '
                   + 'match has no active round.',
                   'DELETE', `/match/${IDS['match:notStarted']}/ridingTime?rider=red`, { as: 'judgeA' });

        await http('http.ridingTime.start.unknownMatch.404', 'POST /match/{matchId}/ridingTime',
                   'The ridingTime controller\'s own 404 branch, which runs BEFORE its no-active-round '
                   + '400 — so an unknown match and a match without a round answer differently.',
                   'POST', '/match/11111111-2222-4333-8444-888888888888/ridingTime',
                   { as: 'judgeA', body: { rider: 'red' } });

        await http('http.ridingTime.end.unknownMatch.404', 'DELETE /match/{matchId}/ridingTime',
                   'Same 404 branch on the DELETE route.',
                   'DELETE', '/match/11111111-2222-4333-8444-888888888888/ridingTime?rider=red',
                   { as: 'judgeA' });

        // =====================================================================
        // WebSocket surface
        // =====================================================================
        await captureWebSocketEvents({
            origin, port, statics, push,
            apiToken: IDS['token:creator'],
            ids: IDS,
        });

    } finally {
        server.close();
    }

    return { records, routeCoverage };
}


// ---------------------------------------------------------------------------
// WebSocket capture
// ---------------------------------------------------------------------------

/**
 * Drives the REAL worker classes against the REAL socket server.
 *
 * Controllers never emit WebSocket events — every emission goes worker ->
 * WorkerWebSocket -> room. Calling `performJob()` directly (rather than letting
 * `queueJob` tick) keeps the path production-identical while making the timing
 * deterministic.
 */
async function captureWebSocketEvents(ctx: {
    origin: string;
    port: number;
    statics: Map<string, string>;
    push: (name: string, route: string | null, why: string, body: any) => void;
    apiToken: string;
    ids: Record<string, string>;
}) {
    const { io } = require('socket.io-client');
    const { MatchUpdateWorker }      = require('../../src/workers/matchUpdateWorker');
    const { TechFallTrackerWorker }  = require('../../src/workers/techFallTrackerWorker');
    const { BreakTransitionWorker }  = require('../../src/workers/breakTransitionWorker');

    const { origin, port, statics, push, apiToken, ids } = ctx;

    /**
     * Joins `matchId`'s room as a normal client, runs one worker tick, and
     * returns every event the client saw.
     */
    async function observe(matchId: string, WorkerCls: any): Promise<Array<{ event: string; payload: any }>> {
        const client = io(origin, { auth: { apiToken }, transports: ['websocket'], forceNew: true });
        await new Promise<void>(resolve => client.on('connect', () => resolve()));

        const seen: Array<{ event: string; payload: any }> = [];
        for (const event of ['match.update', 'round.tech-fall', 'break.ended']) {
            client.on(event, (payload: any) => seen.push({ event, payload }));
        }
        client.emit('match.join', matchId);
        await Bun.sleep(150);

        const worker = new WorkerCls('contract-capture-worker', { port, host: '127.0.0.1' });
        await worker.connect();
        await Bun.sleep(250);
        await worker.performJob();
        await Bun.sleep(400);

        worker.close();
        client.close();
        return seen.filter(e => e.payload && e.payload.id === matchId);
    }

    function record(name: string, why: string, matchId: string,
                    event: { event: string; payload: any } | undefined) {
        const dyn = new DynamicNames();
        push(name, null, why, {
            event:   event ? event.event : null,
            room:    `match:${replaceString(matchId, statics, dyn)}`,
            // WebSocket payloads are NOT wrapped in the {data,status} envelope —
            // the worker emits `match.toApiResponse(...)` directly.
            payload: event ? normalizeValue(event.payload, statics, dyn) : null,
        });
    }

    // match.update while a round is open.
    const openEvents = await observe(ids['match:open'], MatchUpdateWorker);
    record('ws.match.update.openRound',
           'MatchUpdateWorker broadcasts the full Match (mat + judges + rounds) for every open round. '
           + 'No {data,status} envelope — this is the bare object, which is why SocketClient decodes '
           + 'Match directly.',
           ids['match:open'], openEvents.find(e => e.event === 'match.update'));

    // match.update while the match is between rounds — the break_remaining case.
    const breakEvents = await observe(ids['match:break'], MatchUpdateWorker);
    record('ws.match.update.inBreak',
           'The required non-null break_remaining case. MatchUpdateWorker also broadcasts for matches '
           + 'in a break, not just open rounds, and break_remaining counts down from break_duration.',
           ids['match:break'], breakEvents.find(e => e.event === 'match.update'));

    // round.tech-fall — note the deliberately DIFFERENT render options.
    const techFallEvents = await observe(ids['match:wsTechFall'], TechFallTrackerWorker);
    record('ws.round.techFall',
           'TechFallTrackerWorker renders with {includeRounds:true} ONLY — no includeMat and no '
           + 'includeMatchJudges — so `mat` and `judges` are ABSENT (not null) from this payload. '
           + 'That asymmetry is exactly what Match.merge() in models_ext.kt exists to absorb; a capture '
           + 'that normalized absent-to-null would erase it.',
           ids['match:wsTechFall'], techFallEvents.find(e => e.event === 'round.tech-fall'));

    // break.ended — emitted once, when the break expires and the next round opens.
    const breakEndedEvents = await observe(ids['match:wsBreakEnded'], BreakTransitionWorker);
    record('ws.break.ended',
           'BreakTransitionWorker clears the break fields, opens the next round and emits once. '
           + 'break_started_at/break_duration/break_remaining are all null again in this payload.',
           ids['match:wsBreakEnded'], breakEndedEvents.find(e => e.event === 'break.ended'));
}


// ---------------------------------------------------------------------------
// Completeness oracle (plan step 7d)
// ---------------------------------------------------------------------------

export interface CoverageReport {
    routes: string[];
    covered: string[];
    uncovered: string[];
    justified: string[];
    lines: string[];
}


/** Reads `artifacts/route-table.txt` into `METHOD /path` entries. */
export function readRouteTable(): string[] {
    const text = fs.readFileSync(ROUTE_TABLE, 'utf8');
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('TOTAL:'));
}


/**
 * Builds the printable completeness report.
 *
 * Deliberately loud: a harness that quietly covers 80% of the surface reads
 * exactly like one that covers 100%, so the summary is printed on every run and
 * `uncovered` is a hard failure for the caller.
 */
export function buildCoverageReport(result: CaptureResult): CoverageReport {
    const routes    = readRouteTable().sort();
    const covered: string[]   = [];
    const uncovered: string[] = [];
    const justified: string[] = [];

    for (const route of routes) {
        const goldens = result.routeCoverage.get(route) || [];
        if (goldens.length) covered.push(route);
        else if (INTENTIONALLY_UNCOVERED[route]) justified.push(route);
        else uncovered.push(route);
    }

    const wsRecords   = result.records.filter(r => r.name.startsWith('ws.'));
    const httpRecords = result.records.filter(r => r.name.startsWith('http.'));

    const lines: string[] = [];
    lines.push('CONTRACT CAPTURE — COMPLETENESS REPORT');
    lines.push('='.repeat(72));
    lines.push('');
    lines.push(`routes in artifacts/route-table.txt : ${routes.length}`);
    lines.push(`routes with >= 1 golden             : ${covered.length}`);
    lines.push(`routes intentionally uncovered      : ${justified.length}`);
    lines.push(`routes UNCOVERED (must be zero)     : ${uncovered.length}`);
    lines.push(`goldens written (HTTP)              : ${httpRecords.length}`);
    lines.push(`goldens written (WebSocket)         : ${wsRecords.length}`);
    lines.push(`goldens written (total)             : ${result.records.length}`);
    lines.push('');
    lines.push('PER-ROUTE COVERAGE');
    lines.push('-'.repeat(72));
    for (const route of routes) {
        const goldens = result.routeCoverage.get(route) || [];
        if (goldens.length) {
            lines.push(`  [${String(goldens.length).padStart(2)}] ${route}`);
            for (const golden of goldens) lines.push(`        - ${golden}`);
        } else if (INTENTIONALLY_UNCOVERED[route]) {
            lines.push(`  [ -] ${route}   INTENTIONALLY UNCOVERED`);
            lines.push(`        reason: ${INTENTIONALLY_UNCOVERED[route]}`);
        } else {
            lines.push(`  [!!] ${route}   *** UNCOVERED ***`);
        }
    }
    lines.push('');
    lines.push('DOCUMENTED PARTIAL COVERAGE');
    lines.push('-'.repeat(72));
    lines.push('  Routes below HAVE goldens for what production serves, but a mode-specific');
    lines.push('  behaviour is deliberately NOT captured. Each entry is a decision, not a gap.');
    for (const [route, reason] of Object.entries(INTENTIONALLY_UNCOVERED)) {
        lines.push(`  ${route}`);
        lines.push(`      ${reason}`);
    }
    lines.push('');
    lines.push('WEBSOCKET EVENTS');
    lines.push('-'.repeat(72));
    for (const record of wsRecords) {
        lines.push(`  ${String(record.body?.event ?? 'MISSING').padEnd(16)} ${record.name}`);
    }
    lines.push('');

    return { routes, covered, uncovered, justified, lines };
}


// ---------------------------------------------------------------------------
// Golden IO
// ---------------------------------------------------------------------------

export function goldenPath(name: string): string {
    return path.join(GOLDENS_DIR, `${name}.json`);
}


export function serializeGolden(record: Record_): string {
    return JSON.stringify(
        { name: record.name, route: record.route, why: record.why, ...record.body },
        null,
        2,
    ) + '\n';
}


export function writeGoldens(result: CaptureResult): string[] {
    fs.mkdirSync(GOLDENS_DIR, { recursive: true });

    const written: string[] = [];
    for (const record of result.records) {
        fs.writeFileSync(goldenPath(record.name), serializeGolden(record));
        written.push(`${record.name}.json`);
    }

    // Remove goldens for cases that no longer exist, so a deleted case cannot
    // leave a stale file behind that contract.test.js would still replay.
    const expected = new Set(written);
    for (const file of fs.readdirSync(GOLDENS_DIR)) {
        if (file.endsWith('.json') && !expected.has(file)) {
            fs.unlinkSync(path.join(GOLDENS_DIR, file));
        }
    }

    return written.sort();
}


export function readGolden(name: string): string | null {
    const file = goldenPath(name);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
}
