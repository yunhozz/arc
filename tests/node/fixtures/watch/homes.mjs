import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function makeHomes(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-watch-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const userHome = path.join(root, 'home');
  const codexHome = path.join(userHome, '.codex');
  const claudeHome = path.join(userHome, '.claude');
  for (const dir of [userHome, codexHome, claudeHome]) fs.mkdirSync(dir, {recursive:true});
  const write = (file, contents, mtime) => {
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file, contents);
    if (mtime !== undefined) fs.utimesSync(file, new Date(mtime), new Date(mtime));
    return file;
  };
  const jsonl = lines => lines.map(line => typeof line === 'string' ? line : JSON.stringify(line)).join('\n') + '\n';
  return {
    root, userHome, codexHome, claudeHome,
    writeRollout(dateParts, name, lines, {mtime} = {}) {
      return write(path.join(codexHome, 'sessions', ...dateParts.map(String), name), jsonl(lines), mtime);
    },
    writeClaude(projectDir, sessionId, lines, {mtime, subagents = []} = {}) {
      const file = write(path.join(claudeHome, 'projects', projectDir, `${sessionId}.jsonl`), jsonl(lines), mtime);
      for (const agent of subagents) {
        const base = path.join(claudeHome, 'projects', projectDir, sessionId, 'subagents', `agent-${agent.agentId}`);
        write(`${base}.jsonl`, jsonl(agent.lines ?? []), agent.mtime ?? mtime);
        if (agent.meta !== undefined) write(`${base}.meta.json`, typeof agent.meta === 'string' ? agent.meta : JSON.stringify(agent.meta));
      }
      return file;
    },
    writeLease(lease) { return write(path.join(codexHome, 'arc-role-dispatch', `${lease.dispatchId}.json`), JSON.stringify(lease)); },
    writeArtifacts(gitCommonDir, workflowId, dispatchId, files) {
      const dir = path.join(gitCommonDir, 'arc', 'workflows', workflowId, dispatchId);
      for (const [name, contents] of Object.entries(files)) write(path.join(dir, name), typeof contents === 'string' ? contents : JSON.stringify(contents));
      return dir;
    },
    async snapshot() {
      const entries = [];
      const walk = dir => {
        for (const name of fs.readdirSync(dir).sort()) {
          const file = path.join(dir, name), stat = fs.lstatSync(file);
          entries.push({path:path.relative(root, file), size:stat.size, mtimeMs:stat.mtimeMs, mode:stat.mode});
          if (stat.isDirectory()) walk(file);
        }
      };
      walk(root);
      return entries;
    },
  };
}
