import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openRoot} from '../../lib/safe-fs/index.mjs';
import {loadNative} from '../../lib/safe-fs/native.mjs';
const native=loadNative({artifactDirectory:'build/native'});

test('T5 prerequisite: a destination appearing after inspection must retain its bytes', t => {
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-transaction-race-')));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  fs.mkdirSync(path.join(directory,'stage'));
  fs.writeFileSync(path.join(directory,'stage','prepared'),'installer bytes');
  const target=openRoot(directory,{native}),stage=target.openDir('stage');
  t.after(()=>{stage.close();target.close();});
  assert.throws(()=>target.lstat('profile'),{code:'ENOENT'});
  // A user-owned regular file appears in the slot after the last validation.
  fs.writeFileSync(path.join(directory,'profile'),'new user bytes');
  assert.throws(()=>stage.renameNoReplaceTo('prepared',target,'profile'),{code:'EEXIST'});
  assert.equal(fs.readFileSync(path.join(directory,'profile'),'utf8'),'new user bytes');
});
