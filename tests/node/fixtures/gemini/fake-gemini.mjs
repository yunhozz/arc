#!/usr/bin/env node
// Test-only fixture replay. No Gemini CLI or network access.
import fs from 'node:fs/promises';
const args = process.argv.slice(2);
if (args.includes('--version')) {console.log('0.68.0'); process.exit(0);}
let stdin = '';
for await (const chunk of process.stdin) stdin += chunk;
await fs.writeFile(process.env.ARC_FAKE_GEMINI_RECORD, JSON.stringify({argv: args, stdin}));
const sessionId = args[args.indexOf('--session-id') + 1];
let lines = (await fs.readFile(process.env.ARC_FAKE_GEMINI_FIXTURE, 'utf8')).replaceAll('SESSION_ID', sessionId).trim().split('\n').map(JSON.parse);
if (process.env.ARC_FAKE_GEMINI_MISSING_SESSION) lines = lines.map(({session_id, ...event}) => event);
if (process.env.ARC_FAKE_GEMINI_MISSING_MODEL) lines = lines.map(({model, ...event}) => event);
if (process.env.ARC_FAKE_GEMINI_NO_RESULT) lines = lines.filter(event => event.type !== 'result');
if (process.env.ARC_FAKE_GEMINI_NO_EVENTS) lines = [];
if (process.env.ARC_FAKE_GEMINI_WRITE) await fs.writeFile('unexpected.txt', 'permission violation');
if (process.env.ARC_FAKE_GEMINI_HANG) {process.on('SIGTERM', () => {}); lines = lines.slice(0, 1);}
for (const event of lines) console.log(JSON.stringify(event));
if (process.env.ARC_FAKE_GEMINI_HANG) setInterval(() => {}, 1000);
else process.exitCode = process.env.ARC_FAKE_GEMINI_EXIT ? 2 : 0;
