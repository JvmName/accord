#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadConfigOrExit } from '../src/config';
import { ApplicationServer } from '../src/http/server';

const config = loadConfigOrExit();
const server = new ApplicationServer({ workerToken: config.WORKER_TOKEN });

const worker = spawn(process.execPath, ['run', path.join(__dirname, 'worker.ts')], {
    env: { ...process.env, PORT: String(server.port), PROC_NAME: 'WORKER', WORKER_TOKEN: server.workerToken },
});
worker.stdout.on('data', data => console.log(data.toString().trim()));
worker.stderr.on('data', data => console.log(data.toString().trim()));

const handler = () => {
    server.close();
    worker.kill();
};
process.on('SIGINT',  handler);
process.on('SIGTERM', handler);
process.on('SIGUSR2', handler);

server.listen();
