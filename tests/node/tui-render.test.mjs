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

test('shared hints exactly describe menu, page, review, input and busy controls',()=>{
 assert.equal(typeof api.navigationHint,'function');
 assert.equal(api.navigationHint('menu'),'Up/Down: select | Enter: continue | Esc: back');
 assert.equal(api.navigationHint('menu',{backLabel:'exit'}),'Up/Down: select | Enter: continue | Esc: exit');
 assert.equal(api.navigationHint('page'),'Up/Down: scroll | Enter: back | Esc: back');
 assert.equal(api.navigationHint('reviewPage',{hasNext:true}),'Up/Down: scroll | Enter: next | Esc: back');
 assert.equal(api.navigationHint('reviewPage'),'Up/Down: scroll | Enter: continue | Esc: back');
 assert.equal(api.navigationHint('text'),'Type/paste: input | Left: delete | Enter: continue | Esc/Backspace: back');
 assert.equal(api.navigationHint('busy'),'Ctrl+C: interrupt');
});
test('home wordmark is compact, readable without ANSI and absent on inner screens',()=>{
 const home=api.renderScreen({title:'ARC',wordmark:true,rows:['Configure','Update','Uninstall','Exit']});
 assert.ok(home.text.split('\n').length<=12);assert.match(home.text,/ARC/);assert.match(home.text,/[█▀▄]/);assert.doesNotMatch(home.text,/\x1b/);
 assert.ok(home.styles.length>0);assert.doesNotMatch(api.renderScreen({title:'Configure',rows:['Install / Reconfigure']}).text,/[█▀▄]/);
 assert.equal(api.renderScreen({title:'ARC',wordmark:true,rows:['Apply'],requiresConfirmation:true},{columns:80,rows:4}).applyEnabled,false);
});
test('detail wrapping preserves every escaped character without horizontal truncation',()=>{
 assert.equal(typeof api.wrapDetailRows,'function');const source='/tmp/'+('long/').repeat(30)+'END\x1b[2J\rnote';const lines=api.wrapDetailRows([source],24);
 assert.equal(lines.join(''),api.escapeTerminalText(source));assert.ok(lines.every(line=>line.length<=21));
 const wide=api.wrapDetailRows(['가나다라마바사아자차카타파하'],12);assert.equal(wide.join(''),'가나다라마바사아자차카타파하');assert.ok(wide.every(line=>[...line].length<=4));
});
