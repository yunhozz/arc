import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {POLICY_TARGETS, buildPolicyOutputs} from '../lib/policy/render.mjs';
try {
  const args=process.argv.slice(2); let root=fileURLToPath(new URL('../',import.meta.url)),check=false;
  while(args.length) {const arg=args.shift();if(arg==='--check'&&!check)check=true;else if(arg==='--root'&&args[0]&&!args[0].startsWith('--'))root=path.resolve(args.shift());else throw Error(`Unknown or incomplete option: ${arg}`);}
  const policy=JSON.parse(fs.readFileSync(path.join(root,'lib/policy/role-policy.json'),'utf8'));
  const inputs=new Map(POLICY_TARGETS.map(({path:name})=>[name,fs.readFileSync(path.join(root,name))]));
  // All policy, UTF-8 and marker validation completes before the first write.
  const outputs=buildPolicyOutputs(inputs,policy);
  const changed=[...outputs].filter(([name,bytes])=>!bytes.equals(inputs.get(name)));
  if(check) {if(changed.length){console.error(`Role policy outputs are stale: ${changed.map(([name])=>name).join(', ')}`);process.exitCode=1;}else console.log(`Role policy verified (${outputs.size} targets)`);}
  else {for(const [name,bytes] of changed)fs.writeFileSync(path.join(root,name),bytes);console.log(`Updated role policy (${changed.length} targets)`);}
} catch(error) {console.error(error.message);process.exitCode=1;}
