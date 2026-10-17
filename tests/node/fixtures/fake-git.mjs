import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import fs from'node:fs';import path from'node:path';import{spawn,spawnSync}from'node:child_process';
const required={brainstorming:['SKILL.md','visual-companion.md','scripts/start-server.sh','scripts/stop-server.sh','scripts/server.cjs','scripts/helper.js','scripts/frame-template.html'],'writing-plans':['SKILL.md'],'test-driven-development':['SKILL.md','writing-good-tests.md']};
export function referenceFixture(label='A'){
 const entries=new Map([['LICENSE',{type:'file',bytes:Buffer.from('MIT License\nCopyright (c) 2025 Jesse Vincent\n'),mode:0o644n}]]);
 for(const[skill,files]of Object.entries(required)){entries.set(skill,{type:'directory',mode:0o755n});for(const file of files){if(file.startsWith('scripts/'))entries.set(skill+'/scripts',{type:'directory',mode:0o755n});entries.set(skill+'/'+file,{type:'file',bytes:Buffer.from(label+' '+skill+'/'+file+'\n'),mode:file.endsWith('.sh')?0o755n:0o644n});}}
 const provenance={schemaVersion:1,repository:'https://github.com/obra/superpowers',revision:(label==='B'?'b':'a').repeat(40),fetchedAt:'2026-10-17T00:00:00.000Z',skills:Object.keys(required),files:{},links:{}};
 for(const[name,entry]of entries)if(entry.type==='file')provenance.files[name]=createHash('sha256').update(entry.bytes).digest('hex');
 entries.set('provenance.json',{type:'file',bytes:Buffer.from(JSON.stringify(provenance,null,2)+'\n'),mode:0o644n});return{entries,provenance};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
const mode=process.argv[2],work=process.cwd();
if(process.argv[3]==='-C'&&mode!=='revision-hang'){console.log((mode==='snapshot-b'?'b':'a').repeat(40));process.exit(0);}
if(mode==='hang'||mode==='cancel'||(mode==='revision-hang'&&process.argv[3]==='-C')){process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});console.log(`READY ${process.pid} ${child.pid}`);setInterval(()=>{},1000);}
else{
 fs.writeFileSync(path.join(work,'audit.json'),JSON.stringify({argv:process.argv.slice(3),env:process.env,configs:[process.env.npm_config_userconfig,process.env.npm_config_globalconfig,process.env.GIT_CONFIG_GLOBAL].map(p=>fs.readFileSync(p,'utf8'))}));
 for(const[skill,files]of Object.entries(required)){for(const file of files){const name=path.join(work,'upstream/skills',skill,file);fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,file.endsWith('.sh')?'#!/bin/sh\nprintf executed > "$HOME/executed-marker"\nexit 99\n':`${mode==='snapshot-b'?'snapshot B':'verified'} ${skill}/${file}\n`,{mode:file.endsWith('.sh')?0o755:0o644});}}
 const root=path.join(work,'upstream/skills/brainstorming');
 if(mode==='snapshot-b')fs.writeFileSync(root+'/new-upstream-file','snapshot B');else fs.writeFileSync(root+'/retired-upstream-file','snapshot A');
 if(mode==='missing-file')fs.unlinkSync(path.join(root,'visual-companion.md'));
 if(mode==='internal-link'||mode==='absolute-link'){fs.symlinkSync(mode==='absolute-link'?path.join(root,'visual-companion.md'):'visual-companion.md',path.join(root,'alias.md'));}
 if(mode==='chained-link'){fs.symlinkSync('visual-companion.md',path.join(root,'alias-first.md'));fs.symlinkSync('alias-first.md',path.join(root,'alias-second.md'));}
 if(mode==='directory-link'){fs.renameSync(path.join(root,'scripts'),path.join(root,'real-scripts'));fs.symlinkSync('real-scripts',path.join(root,'scripts'));fs.symlinkSync('scripts/helper.js',path.join(root,'helper-alias.js'));}
 if(mode==='escape-link')fs.symlinkSync('/etc/passwd',path.join(root,'escape'));
 if(mode==='dangling-link')fs.symlinkSync('missing',path.join(root,'dangling'));
 if(mode==='cycle-link'){fs.symlinkSync('b',path.join(root,'a'));fs.symlinkSync('a',path.join(root,'b'));}
 if(mode==='directory-cycle'){fs.mkdirSync(path.join(root,'sub'));fs.symlinkSync('..',path.join(root,'sub/back'));}
 if(mode==='special-file')spawnSync('mkfifo',[path.join(root,'pipe')]);
 if(mode==='root-link'){fs.renameSync(root,root+'-real');fs.symlinkSync('brainstorming-real',root);}
 fs.writeFileSync(path.join(work,'upstream/LICENSE'),'MIT License\nCopyright (c) 2025 Jesse Vincent\n');
 if(mode==='nonzero'){console.error('fixture failure');process.exitCode=7;}else if(mode==='stderr-nonutf8')process.stderr.write(Buffer.from([255]));
}
}
