#!/usr/bin/env bun
import { createDb, migrateDb, resolveDatabasePath } from '../src/db';

const db = createDb();
migrateDb(db);
db.$client.close();
console.log(`Migrated ${resolveDatabasePath()}`);
