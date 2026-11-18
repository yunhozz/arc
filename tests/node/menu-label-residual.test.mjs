import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const self=fileURLToPath(import.meta.url);
const EXTRA_PATHS = [];
const legacyLabel='Install / ' + 'Update';

test('no legacy Install/Update label in shipped code, payloads or tests',()=>{
 const {files}=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const targets=[...files.filter(name=>!name.startsWith('!')), 'tests/node', ...EXTRA_PATHS];
 const scanned=new Set(),matches=[];
 function scan(filename){
  if(filename===self||scanned.has(filename))return;
  scanned.add(filename);
  if(fs.statSync(filename).isDirectory()){
   for(const name of fs.readdirSync(filename).sort())scan(path.join(filename,name));
   return;
  }
  fs.readFileSync(filename,'utf8').split('\n').forEach((line,index)=>{
   if(line.includes(legacyLabel))matches.push(`${path.relative(root,filename)}:${index+1}`);
  });
 }
 for(const name of targets){const filename=path.join(root,name);if(fs.existsSync(filename))scan(filename);}
 assert.deepEqual(matches.sort(),[]);
});
