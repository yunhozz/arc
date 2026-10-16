import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{spawn as realSpawn}from'node:child_process';
import{openRoot}from'../../lib/safe-fs/index.mjs';import{loadNative}from'../../lib/safe-fs/native.mjs';
const api=await import('../../lib/installer/acquisition.mjs').catch(()=>({}));const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};const fixture=new URL('./fixtures/fake-npx.mjs',import.meta.url).pathname;
const argv=['--yes','skills@latest','add','https://github.com/obra/superpowers','--skill','brainstorming','writing-plans','test-driven-development','--agent','universal','--yes','--copy','--json'];
function work(t){const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-acquisition-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));const work=path.join(base,'work');fs.mkdirSync(work);return{base,work};}
function launcher(mode,seen={}){return(executable,args,options)=>{seen.calls=(seen.calls??0)+1;Object.assign(seen,{executable,args,options});const child=realSpawn(process.execPath,[fixture,mode,...args],options);seen.child=child;return child;};}
const run=(work,mode='valid',extra={})=>api.acquireExternalSkills({work,safeFs,spawn:launcher(mode),...extra});
test('acquires exactly three verified skill snapshots using exact argv and isolated environment',async t=>{const{work:directory,base}=work(t),seen={};assert.equal(typeof api.acquireExternalSkills,'function');const secretKeys={NODE_OPTIONS:'--require /do-not-run',NPM_TOKEN:'secret-token',HTTPS_PROXY:'secret-proxy',GITHUB_TOKEN:'secret-git',CLAUDE_CONFIG_DIR:'/private-config'};const original={};for(const[k,v]of Object.entries(secretKeys)){original[k]=process.env[k];process.env[k]=v;}let result;try{result=await run(directory,'valid',{spawn:launcher('valid',seen)});}finally{for(const[k,v]of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
 assert.equal(seen.calls,1);assert.equal(seen.executable,'npx');assert.deepEqual(seen.args,argv);assert.equal(seen.options.shell,false);assert.equal(seen.options.detached,true);assert.equal(seen.options.cwd,directory);for(const key of Object.keys(secretKeys))assert.equal(seen.options.env[key],undefined);assert.ok(seen.options.env.HOME.startsWith(directory+'/'));assert.ok(seen.options.env.TMPDIR.startsWith(directory+'/'));assert.equal(seen.options.env.GIT_CONFIG_NOSYSTEM,'1');assert.equal(seen.options.env.GIT_TERMINAL_PROMPT,'0');assert.ok(result.skills instanceof Map);assert.deepEqual([...result.skills.keys()],['brainstorming','writing-plans','test-driven-development']);const audit=JSON.parse(fs.readFileSync(directory+'/audit.json'));assert.deepEqual(audit.configs,['','','']);assert.equal(fs.existsSync(directory+'/home/executed-marker'),false);const allowed=new Set(['PATH','LANG','LC_ALL','CI','DO_NOT_TRACK','HOME','XDG_CONFIG_HOME','CODEX_HOME','TMPDIR','XDG_STATE_HOME','npm_config_cache','npm_config_userconfig','npm_config_globalconfig','npm_config_audit','npm_config_fund','npm_config_update_notifier','GIT_CONFIG_NOSYSTEM','GIT_CONFIG_GLOBAL','GIT_TERMINAL_PROMPT']);assert.ok(Object.keys(seen.options.env).every(key=>allowed.has(key)));assert.ok(result.skills.get('brainstorming').entries.get('scripts/start-server.sh').bytes.includes(Buffer.from('exit 99')));assert.equal(Number(result.skills.get('brainstorming').entries.get('scripts/start-server.sh').mode&0o777n),0o755&~process.umask());assert.ok(fs.existsSync(directory+'/.agents/skills/brainstorming/SKILL.md'));assert.deepEqual(fs.readdirSync(base),['work']);});
const rejectionCases=[
  [
    "wrong-status",
    "rejects wrong-status and empties only work"
  ],
  [
    "wrong-source",
    "rejects wrong-source and empties only work"
  ],
  [
    "wrong-ref",
    "rejects wrong-ref and empties only work"
  ],
  [
    "wrong-scope",
    "rejects wrong-scope and empties only work"
  ],
  [
    "wrong-agents",
    "rejects wrong-agents and empties only work"
  ],
  [
    "wrong-mode",
    "rejects wrong-mode and empties only work"
  ],
  [
    "wrong-path",
    "rejects wrong-path and empties only work"
  ],
  [
    "omit-name",
    "rejects omit-name and empties only work"
  ],
  [
    "omit-status",
    "rejects omit-status and empties only work"
  ],
  [
    "omit-source",
    "rejects omit-source and empties only work"
  ],
  [
    "omit-ref",
    "rejects omit-ref and empties only work"
  ],
  [
    "omit-scope",
    "rejects omit-scope and empties only work"
  ],
  [
    "omit-agents",
    "rejects omit-agents and empties only work"
  ],
  [
    "omit-mode",
    "rejects omit-mode and empties only work"
  ],
  [
    "omit-path",
    "rejects omit-path and empties only work"
  ],
  [
    "duplicate",
    "rejects duplicate and empties only work"
  ],
  [
    "missing",
    "rejects missing and empties only work"
  ],
  [
    "extra",
    "rejects extra and empties only work"
  ],
  [
    "malformed",
    "rejects malformed and empties only work"
  ],
  [
    "nonarray",
    "rejects nonarray and empties only work"
  ],
  [
    "nonobject",
    "rejects nonobject and empties only work"
  ],
  [
    "nonutf8",
    "rejects nonutf8 and empties only work"
  ],
  [
    "stderr-nonutf8",
    "rejects stderr-nonutf8 and empties only work"
  ],
  [
    "nonzero",
    "rejects nonzero and empties only work"
  ],
  [
    "missing-file",
    "rejects missing-file and empties only work"
  ],
  [
    "root-link",
    "rejects root-link and empties only work"
  ],
  [
    "escape-link",
    "rejects escape-link and empties only work"
  ],
  [
    "dangling-link",
    "rejects dangling-link and empties only work"
  ],
  [
    "cycle-link",
    "rejects cycle-link and empties only work"
  ],
  [
    "directory-cycle",
    "rejects directory-cycle and empties only work"
  ],
  [
    "special-file",
    "rejects special-file and empties only work"
  ]
];
for(const [mode,title] of rejectionCases)test(title,async t=>{const{work:directory,base}=work(t);fs.writeFileSync(base+'/sentinel','private');await assert.rejects(()=>run(directory,mode),error=>error.code==='ARC_ACQUISITION');assert.deepEqual(fs.readdirSync(directory),[]);assert.equal(fs.readFileSync(base+'/sentinel','utf8'),'private');});
for(const mode of ['internal-link','absolute-link'])test(`normalizes ${mode} into in-root staging metadata`,async t=>{const{work:directory}=work(t);const result=await run(directory,mode),entry=result.skills.get('brainstorming').entries.get('alias.md');assert.equal(entry.type,'symlink');assert.equal(entry.target,'visual-companion.md');assert.equal(entry.link,'visual-companion.md');});
test('permits unconsumed extra record metadata',async t=>{await run(work(t).work,'extra-key');});
test('nonempty or symlink work is rejected without clearing existing content',async t=>{const{work:directory,base}=work(t);fs.writeFileSync(directory+'/original','keep');await assert.rejects(()=>run(directory),{code:'ARC_ACQUISITION'});assert.equal(fs.readFileSync(directory+'/original','utf8'),'keep');fs.symlinkSync(directory,base+'/alias');await assert.rejects(()=>run(base+'/alias'),{code:'ARC_ACQUISITION'});assert.equal(fs.readFileSync(directory+'/original','utf8'),'keep');});
test('spawn failure cleans isolated configuration',async t=>{const{work:directory}=work(t);await assert.rejects(()=>run(directory,'valid',{spawn(){throw Error('spawn unavailable');}}),{code:'ARC_ACQUISITION'});assert.deepEqual(fs.readdirSync(directory),[]);});
function fastClock(delays){return{setTimeout(handler,ms){delays.push(ms);return setTimeout(handler,ms===300000?900:ms===5000?120:1);},clearTimeout};}
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
test('timeout sends TERM then KILL and removes descendants before cleanup',async t=>{const{work:directory}=work(t),seen={},delays=[];const spawn=launcher('hang',seen);let descendant;const wrapped=(...args)=>{const child=spawn(...args);child.stdout.on('data',chunk=>{const match=/READY \d+ (\d+)/.exec(chunk.toString());if(match)descendant=Number(match[1]);});return child;};await assert.rejects(()=>run(directory,'hang',{spawn:wrapped,clock:fastClock(delays)}),{code:'ARC_ACQUISITION_TIMEOUT'});assert.ok(delays.includes(300000));assert.ok(delays.includes(5000));assert.ok(descendant);assert.equal(alive(seen.child.pid),false);assert.equal(alive(descendant),false);assert.deepEqual(fs.readdirSync(directory),[]);});
test('abort cancels process group and cleans work',async t=>{const{work:directory}=work(t),controller=new AbortController(),delays=[];let leader,descendant;const spawn=(...args)=>{const child=launcher('cancel')(...args);leader=child.pid;child.stdout.on('data',chunk=>{const match=/READY \d+ (\d+)/.exec(chunk.toString());if(match){descendant=Number(match[1]);controller.abort();}});return child;};await assert.rejects(()=>run(directory,'cancel',{spawn,signal:controller.signal,clock:fastClock(delays)}),{code:'ARC_ACQUISITION_CANCELLED'});assert.equal(alive(leader),false);assert.equal(alive(descendant),false);assert.deepEqual(fs.readdirSync(directory),[]);});
test('valid chained file links resolve to canonical in-root targets',async t=>{const result=await run(work(t).work,'chained-link');const entries=result.skills.get('brainstorming').entries;assert.equal(entries.get('alias-first.md').target,'visual-companion.md');assert.equal(entries.get('alias-second.md').target,'visual-companion.md');assert.equal(entries.get('alias-second.md').link,'visual-companion.md');});
test('valid directory links resolve required files without executing them',async t=>{const result=await run(work(t).work,'directory-link');const entries=result.skills.get('brainstorming').entries;assert.equal(entries.get('scripts').target,'real-scripts');assert.equal(entries.get('helper-alias.js').target,'real-scripts/helper.js');assert.ok(entries.get('real-scripts/start-server.sh').bytes.includes(Buffer.from('exit 99')));});
test('signal-zero EPERM means still alive until confirmed gone',async t=>{const{work:directory}=work(t),original=process.kill;let forced=0;process.kill=function(pid,signal){try{return original.call(process,pid,signal);}catch(error){if(pid<0&&signal===0&&error.code==='ESRCH'&&forced===0){forced++;throw Object.assign(new Error('transient probe'),{code:'EPERM'});}throw error;}};try{await assert.rejects(()=>run(directory,'hang',{clock:fastClock([])}),{code:'ARC_ACQUISITION_TIMEOUT'});assert.equal(forced,1);assert.deepEqual(fs.readdirSync(directory),[]);}finally{process.kill=original;}});
test('acquired file replacement fails before reading an outside sentinel',async t=>{const{work:directory,base}=work(t),outside=base+'/sentinel';fs.writeFileSync(outside,'outside secret');const identity=fs.statSync(outside,{bigint:true});let swapped=false,readOutside=false;
 function wrap(handle){return new Proxy(handle,{get(target,key){if(key==='openDir')return name=>wrap(target.openDir(name));if(key==='openFile')return(name,options)=>{if(name==='SKILL.md'&&!swapped){swapped=true;fs.unlinkSync(directory+'/.agents/skills/brainstorming/SKILL.md');fs.linkSync(outside,directory+'/.agents/skills/brainstorming/SKILL.md');}return wrap(target.openFile(name,options));};if(key==='readAll')return()=>{const stat=target.stat();if(stat.dev===identity.dev&&stat.ino===identity.ino)readOutside=true;return target.readAll();};const member=target[key];return typeof member==='function'?member.bind(target):member;}});}
 await assert.rejects(()=>run(directory,'valid',{safeFs:{openRoot:p=>wrap(safeFs.openRoot(p))}}),{code:'ARC_ACQUISITION'});assert.equal(swapped,true);assert.equal(readOutside,false);assert.equal(fs.readFileSync(outside,'utf8'),'outside secret');assert.deepEqual(fs.readdirSync(directory),[]);
});
test('failure cleanup clears only held work after its path is replaced',async t=>{const{work:directory,base}=work(t),moved=base+'/moved',outside=base+'/outside';fs.mkdirSync(outside);fs.writeFileSync(outside+'/sentinel','keep');const spawn=(...args)=>{const child=launcher('malformed')(...args);child.once('close',()=>{fs.renameSync(directory,moved);fs.symlinkSync(outside,directory);});return child;};await assert.rejects(()=>run(directory,'malformed',{spawn}),{code:'ARC_ACQUISITION'});assert.deepEqual(fs.readdirSync(moved),[]);assert.equal(fs.readFileSync(outside+'/sentinel','utf8'),'keep');assert.ok(fs.lstatSync(directory).isSymbolicLink());});
