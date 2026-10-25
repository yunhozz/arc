import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sourceRoot} from './fixtures/static-references.mjs';

const wrapper=path.join(sourceRoot,'scripts/update-superpowers-local.sh');
const required=process.env.ARC_REQUIRE_LOCAL_UPDATER==='1';
test('local updater forwards only to its sibling tracked updater',{
 skip:!required&&!fs.existsSync(wrapper)?'worktree-local updater is not provided in this clone':false,
},async t=>{
 assert.ok(fs.existsSync(wrapper),'required local updater is missing');
 const stat=fs.lstatSync(wrapper),bytes=fs.readFileSync(wrapper);
 assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'local updater must be a regular file');
 assert.ok(stat.mode&0o111,'local updater must be executable');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc local updater ')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const scripts=path.join(root,'scripts with spaces'),bin=path.join(root,'stub bin'),cwd=path.join(root,'another cwd');
 for(const directory of [scripts,bin,cwd])fs.mkdirSync(directory);
 const copied=path.join(scripts,'update-superpowers-local.sh'),updater=path.join(scripts,'update-superpowers.mjs'),record=path.join(root,'node arguments.json');
 fs.writeFileSync(copied,bytes,{mode:stat.mode&0o777});
 assert.deepEqual(fs.readFileSync(copied),bytes);
 fs.writeFileSync(updater,"throw Error('dummy updater must never execute');\n");
 fs.writeFileSync(path.join(bin,'node'),`#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync(process.env.ARC_NODE_RECORD,JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));process.stdout.write('stub stdout\\n');process.stderr.write('stub stderr\\n');process.exit(23);\n`,{mode:0o755});
 const args=['--source-dir','a path with spaces','literal $value; no expansion'];
 const result=spawnSync(copied,args,{cwd,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,ARC_NODE_RECORD:record},encoding:'utf8'});
 assert.equal(result.status,23,result.error?.message);
 assert.equal(result.stdout,'stub stdout\n');assert.equal(result.stderr,'stub stderr\n');
 assert.deepEqual(JSON.parse(fs.readFileSync(record)),{args:[updater,...args],cwd});
 assert.doesNotMatch(bytes.toString(),/\b(?:git|curl|wget|fetch|clone)\b/,'wrapper must not duplicate upstream acquisition');
 assert.equal(fs.readFileSync(sourceRoot+'/.gitignore','utf8').split(/\r?\n/).filter(line=>line==='/scripts/update-superpowers-local.sh').length,1);
 assert.deepEqual(fs.readFileSync(wrapper),bytes);
});
