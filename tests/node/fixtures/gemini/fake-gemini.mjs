#!/usr/bin/env node
// Test-only fixture replay. No Gemini CLI or network access.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const args = process.argv.slice(2);
if (args.includes('--version')) {console.log('0.68.0'); process.exit(0);}
let stdin = '';
for await (const chunk of process.stdin) stdin += chunk;
await fs.writeFile(process.env.ARC_FAKE_GEMINI_RECORD, JSON.stringify({argv: args, stdin}));
const sessionId = args[args.indexOf('--session-id') + 1];
const scenario = path.basename(process.env.ARC_FAKE_GEMINI_FIXTURE, '.jsonl').slice('stream-'.length);
const timestamp = '2026-11-16T14:14:05.243Z';
const content = scenario === 'empty' ? '   ' : 'L5-TOKEN-4b1d';
let lines = [
  {type: 'init', timestamp, session_id: scenario === 'session-mismatch' ? '00000000-0000-4000-8000-000000000000' : sessionId, model: scenario === 'model-mismatch' ? 'gemini-other' : 'gemini-test'},
  {type: 'message', timestamp, role: 'user', content: 'User text must not become the result'},
  {type: 'tool_use', timestamp, tool_name: 'read_file', tool_id: 'read_file_1', parameters: {file_path: 'token.txt'}},
  {type: 'tool_result', timestamp, tool_id: 'read_file_1', status: 'success', output: 'Tool output must not become the result'},
  ...(process.env.ARC_FAKE_GEMINI_WHOLE_MESSAGE || scenario === 'empty'
    ? [{type: 'message', timestamp, role: 'assistant', content}]
    : [{type: 'message', timestamp, role: 'assistant', content: 'L5-TOKEN', delta: true},
      {type: 'message', timestamp, role: 'user', content: 'Interleaved user text'},
      {type: 'message', timestamp, role: 'assistant', content: '-4b1d', delta: true}]),
  ...(scenario === 'unknown-event' ? [{type: 'future_event', payload: {untouched: 'raw event'}}] : []),
  {type: 'result', timestamp, status: scenario === 'error' ? 'error' : 'success', stats: {total_tokens: 100, input_tokens: 90, output_tokens: 10, cached: 0, input: 90, duration_ms: 100, tool_calls: 1, models: {'gemini-test': {total_tokens: 100, input_tokens: 90, output_tokens: 10, cached: 0, input: 90}}}},
];
if (process.env.ARC_FAKE_GEMINI_MISSING_SESSION) lines = lines.map(({session_id, ...event}) => event);
if (process.env.ARC_FAKE_GEMINI_MISSING_MODEL) lines = lines.map(({model, ...event}) => event);
if (process.env.ARC_FAKE_GEMINI_NO_RESULT) lines = lines.filter(event => event.type !== 'result');
if (process.env.ARC_FAKE_GEMINI_NO_EVENTS) lines = [];
if (process.env.ARC_FAKE_GEMINI_WRITE) await fs.writeFile('unexpected.txt', 'permission violation');
if (process.env.ARC_FAKE_GEMINI_HANG) {process.on('SIGTERM', () => {}); lines = lines.slice(0, 1);}
const {ARC_FAKE_ESCAPE_PID_FILE: escapePid, ARC_FAKE_ESCAPE_RELEASE_FILE: escapeRelease} = process.env;
if (escapePid) {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', '--', process.argv[1]], {detached: true, stdio: 'ignore'});
  child.unref();
  await fs.appendFile(`${path.dirname(path.dirname(process.argv[1]))}.pids`, `${child.pid}\n`);
  await fs.writeFile(escapePid, String(child.pid));
  if (escapeRelease) {
    while (!await fs.stat(escapeRelease).catch(error => {if (error.code !== 'ENOENT') throw error;})) await delay(20);
  }
}
for (const event of lines) console.log(JSON.stringify(event));
if (process.env.ARC_FAKE_GEMINI_HANG) setInterval(() => {}, 1000);
else process.exitCode = process.env.ARC_FAKE_GEMINI_EXIT ? 2 : 0;
