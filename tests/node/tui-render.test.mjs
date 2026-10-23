import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../../lib/tui/render.mjs').catch(()=>({}));
test('renderer escapes injected terminal controls in every user-visible field',()=>{
 assert.equal(typeof api.renderScreen,'function');
 const rendered=api.renderScreen({title:'Home\x1b]52;x\x07',rows:['a\rb\tc\n\x9bd'],hint:'Help\x1b[2J',selected:0},{columns:80,rows:24});
 assert.doesNotMatch(rendered.text,/[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
 assert.match(rendered.text,/\\x1b\]52/);assert.match(rendered.text,/a\\x0db\\x09c\\x0a/);assert.match(rendered.text,/Help\\x1b\[2J/);
});
test('required rows and clipped required text disable confirmation until resize fits',()=>{
 assert.equal(typeof api.renderScreen,'function');
 const screen={title:'Review',rows:['Destination: /tmp/arc','Changes: replace config','Apply'],selected:2,requiresConfirmation:true};
 assert.equal(api.renderScreen(screen,{columns:80,rows:4}).applyEnabled,false);
 assert.equal(api.renderScreen(screen,{columns:12,rows:24}).applyEnabled,false);
 const full=api.renderScreen(screen,{columns:80,rows:24});assert.equal(full.applyEnabled,true);assert.match(full.text,/> Apply/);
 const small=api.renderScreen(screen,{columns:12,rows:4});assert.ok(small.text.split('\n').length<=4);for(const line of small.text.split('\n'))assert.ok([...line].length<=12);
});
