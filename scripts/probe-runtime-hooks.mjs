import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {summarizeProbe} from '../lib/runtime/capabilities.mjs';

// This tool does not install hooks, grant trust, or execute the tool being probed.
// Host-result receipts must be supplied by the trusted probe host after checking
// actual non-execution. A hook-decision receipt alone never verifies denial.
export function writeProbeReceipt(receipt,data,write = fs.writeFileSync) {
    let fd;
    try {
      fd=fs.openSync(receipt,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
      write(fd,JSON.stringify(data)+'\n');
    } catch(error) {
      if(fd !== undefined) fs.unlinkSync(receipt);
      throw error;
    } finally { if(fd !== undefined) fs.closeSync(fd); }
}

if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
try {
  const [mode,...args] = process.argv.slice(2);
  const options = {};
  for(let i=0;i<args.length;i+=2) {
    if(!['--platform','--session','--version','--receipt','--attempt','--scratch'].includes(args[i]) || !args[i+1]) throw new Error('Invalid probe options');
    options[args[i].slice(2)] = args[i+1];
  }
  const {platform,session:sessionRef,version:platformVersion,attempt:attemptRef,scratch,receipt} = options;
  if(!['codex','claude'].includes(platform) || !sessionRef || !platformVersion || !attemptRef || !receipt || !path.isAbsolute(receipt)) throw new Error('Explicit platform, session, version and absolute scratch receipt required');
  if(mode === 'summary') {
    const parsed = JSON.parse(fs.readFileSync(receipt,'utf8'));
    console.log(JSON.stringify(summarizeProbe(Array.isArray(parsed)?parsed:[parsed],{platform,sessionRef,platformVersion,attemptRef})));
  } else if(mode === 'hook') {
    const input = JSON.parse(fs.readFileSync(0,'utf8'));
    if(input.hook_event_name !== 'PreToolUse' || typeof input.tool_name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(input.tool_name)) throw new Error('Only PreToolUse canary requests supported');
    if(!scratch || !path.isAbsolute(scratch)) throw new Error('Explicit private scratch directory required');
    const realScratch=fs.realpathSync(scratch);
    const stat=fs.lstatSync(scratch);
    if(stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid()) ||
      path.dirname(realScratch) !== fs.realpathSync(os.tmpdir()) ||
      !path.basename(realScratch).startsWith('arc-runtime-probe-') ||
      fs.realpathSync(path.dirname(path.resolve(receipt))) !== realScratch) throw new Error('Receipt must be directly inside private probe scratch');
    const data={source:'native',kind:'hook-decision',platform,platformVersion,sessionRef,attemptRef,
      event:'PreToolUse',toolPath:input.tool_name,
      operation:input.tool_name === 'Agent' ? (platform === 'codex' ? 'spawn_agent' : 'Agent') : null,decision:'deny'};
    // Exclusive creation prevents truncation and symlink following. No staging
    // file is needed; remove our own new receipt if its write fails.
    writeProbeReceipt(receipt,data);
    console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'ARC scratch canary deny'}}));
  } else throw new Error('Expected hook or summary mode');
} catch(error) { console.error(error.message); process.exitCode=1; }

}
