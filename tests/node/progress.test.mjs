import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../../lib/cli/progress.mjs').catch(()=>({}));
function fixture(isTTY){let text='',tick,cleared=0;const output={isTTY,write:value=>{text+=value;}};return{output,text:()=>text,tick:()=>tick(),cleared:()=>cleared,setInterval:(callback,ms)=>{assert.equal(ms,80);tick=callback;return 42;},clearInterval:id=>{assert.equal(id,42);cleared++;}};}
test('TTY progress immediately renders, advances, preserves messages and stops once',()=>{
 assert.equal(typeof api.startProgress,'function');const io=fixture(true),progress=api.startProgress({...io,label:'Installing ARC…'});const first=io.text();assert.match(first,/Installing ARC…/);io.tick();assert.notEqual(io.text().slice(first.length),first);progress.write('Summary\n');assert.match(io.text(),/Summary\n.*Installing ARC…/s);progress.stop();const stopped=io.text();progress.stop();assert.equal(io.text(),stopped);assert.equal(io.cleared(),1);progress.write('Done\n');assert.ok(io.text().endsWith('Done\n'));
});
test('non-TTY progress emits one plain label without timer or ANSI',()=>{
 assert.equal(typeof api.startProgress,'function');const io=fixture(false);const progress=api.startProgress({...io,label:'Checking ARC…',setInterval:()=>{throw Error('non-TTY timer');}});progress.write('Summary\n');progress.stop();progress.stop();assert.equal(io.text(),'Checking ARC…\nSummary\n');assert.equal(io.cleared(),0);
});
