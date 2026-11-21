#!/usr/bin/env node
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const argv = process.argv.slice(2), value = flag => argv[argv.indexOf(flag) + 1];
if (argv.includes('--version')) {console.log('1.0.88'); process.exit(0);}
let stdin = ''; for await (const chunk of process.stdin) stdin += chunk;
const promptFile = value('--prompt-file'), scenario = process.env.ARC_FAKE_GROK_SCENARIO ?? 'ok';
await fs.writeFile(process.env.ARC_FAKE_GROK_RECORD, JSON.stringify({argv, stdin, prompt: await fs.readFile(promptFile, 'utf8'), mode: (await fs.stat(promptFile)).mode & 0o777, autoUpdater: process.env.GROK_DISABLE_AUTOUPDATER, claudeEnv: Object.fromEntries(['AGENTS', 'SKILLS', 'RULES', 'MCPS', 'HOOKS'].map(k => [k, process.env['GROK_CLAUDE_' + k + '_ENABLED'] ?? null]))}));
const sessionId = scenario === 'session-mismatch' ? '99999999-9999-4999-8999-999999999999' : value('--session-id');
const model = scenario === 'model-mismatch' ? 'different-model' : value('-m');
let events = [
  {type: 'thought', data: 'Private thought must not become the result'},
  {type: 'tool_call', name: 'Read'}, {type: 'tool_call_update', data: 'tool output'},
  {type: 'text', data: scenario === 'empty-text' ? ' ' : 'GROK-TOKEN'},
  {type: 'text', data: scenario === 'empty-text' ? '\n' : '-7c2e'},
  {type: 'usage', model},
  ...(scenario === 'error-event' ? [{type: 'error', message: 'failed'}] : []),
  ...(scenario === 'unknown-event' ? [{type: 'future_event', payload: {untouched: 'raw event'}}] : []),
  {type: 'end', sessionId, stopReason: scenario === 'stop-max-tokens' ? 'max_tokens' : 'end_turn', modelUsage: {[model]: {inputTokens: 10}}},
];
if (scenario === 'no-model') events = events.map(({model, ...event}) => event);
if (scenario === 'no-end') events = events.filter(event => event.type !== 'end');
if (scenario === 'write') await fs.writeFile('unexpected.txt', 'permission violation');
if (scenario === 'hang') {process.on('SIGTERM', () => {}); events = process.env.ARC_FAKE_GROK_NO_EVENTS ? [] : [events.at(-1)];}
const {ARC_FAKE_ESCAPE_PID_FILE: escapePid, ARC_FAKE_ESCAPE_RELEASE_FILE: escapeRelease} = process.env;
if (escapePid) {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', '--', process.argv[1]], {detached: true, stdio: 'ignore'});
  child.unref();
  await fs.writeFile(escapePid, String(child.pid));
  if (escapeRelease) {
    while (!await fs.stat(escapeRelease).catch(error => {if (error.code !== 'ENOENT') throw error;})) await delay(20);
  }
}
for (const event of events) console.log(JSON.stringify(event));
if (scenario === 'hang') setInterval(() => {}, 1000);
else process.exitCode = scenario === 'exit-nonzero' ? 2 : 0;
