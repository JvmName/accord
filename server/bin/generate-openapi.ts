/**
 * Generates `openapi.json` from the task-05 Zod wire schemas.
 *
 * Run via `bun run generate:openapi`. The output is committed so a fresh
 * clone has a spec without running codegen.
 */
import fs from 'fs';
import path from 'path';
import { generateOpenApiDocument } from '../src/contract/openapi';

const document = generateOpenApiDocument();
const outPath = path.join(__dirname, '..', 'openapi.json');

// Trailing newline so the committed file matches what most editors/`git diff`
// expect, and so `bun run generate:openapi` twice in a row is byte-identical.
fs.writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n');

console.log(`Wrote ${outPath}`);
