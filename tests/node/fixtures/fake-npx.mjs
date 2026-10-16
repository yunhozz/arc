import fs from'node:fs';import path from'node:path';import{spawn,spawnSync}from'node:child_process';
const mode=process.argv[2],work=process.cwd();
const required={brainstorming:['SKILL.md','visual-companion.md','scripts/start-server.sh','scripts/stop-server.sh','scripts/server.cjs','scripts/helper.js','scripts/frame-template.html'],'writing-plans':['SKILL.md'],'test-driven-development':['SKILL.md','writing-good-tests.md']};
if(mode==='hang'||mode==='cancel'){process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});console.log(`READY ${process.pid} ${child.pid}`);setInterval(()=>{},1000);}
else{
 fs.writeFileSync(path.join(work,'audit.json'),JSON.stringify({argv:process.argv.slice(3),env:process.env,configs:[process.env.npm_config_userconfig,process.env.npm_config_globalconfig,process.env.GIT_CONFIG_GLOBAL].map(p=>fs.readFileSync(p,'utf8'))}));
 for(const[skill,files]of Object.entries(required)){for(const file of files){const name=path.join(work,'.agents/skills',skill,file);fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,file.endsWith('.sh')?'#!/bin/sh\nprintf executed > "$HOME/executed-marker"\nexit 99\n':`verified ${skill}/${file}\n`,{mode:file.endsWith('.sh')?0o755:0o644});}}
 const root=path.join(work,'.agents/skills/brainstorming');
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
 const records=Object.keys(required).map(name=>({name,status:'installed',source:'obra/superpowers',ref:null,scope:'project',agents:['Universal'],mode:'copy',path:path.join(work,'.agents/skills',name)}));
 const fieldValues={status:'skipped',source:'other/source',ref:'pinned',scope:'global',agents:['Codex'],mode:'symlink',path:path.join(work,'.agents/skills/brainstorming/..','brainstorming')+'/.'};
 if(mode.startsWith('wrong-')){const field=mode.slice(6);records[0][field]=fieldValues[field];}
 if(mode.startsWith('omit-'))delete records[0][mode.slice(5)];
 if(mode==='duplicate')records[1]=records[0];if(mode==='missing')records.pop();if(mode==='extra')records.push({...records[0],name:'using-git-worktrees'});if(mode==='extra-key')records[0].description='ignored metadata';
 if(mode==='nonzero'){console.error('fixture failure');process.exitCode=7;}else if(mode==='malformed')console.log('not json');else if(mode==='nonarray')console.log('{}');else if(mode==='nonobject')console.log('[null,null,null]');else if(mode==='nonutf8')process.stdout.write(Buffer.from([255]));else if(mode==='stderr-nonutf8'){process.stderr.write(Buffer.from([255]));console.log(JSON.stringify(records));}else console.log(JSON.stringify(records));
}
