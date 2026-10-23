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
 assert.equal(api.navigationHint('menu'),'↑/↓: Select · Enter Continue · Esc Back');
 assert.equal(api.navigationHint('menu',{backLabel:'exit'}),'↑/↓: Select · Enter Continue · Esc Exit');
 assert.equal(api.navigationHint('page'),'↑/↓: Scroll · Enter Back · Esc Back');
 assert.equal(api.navigationHint('reviewPage',{hasNext:true}),'↑/↓: Scroll · Enter Next · Esc Back');
 assert.equal(api.navigationHint('reviewPage'),'↑/↓: Scroll · Enter Continue · Esc Back');
 assert.equal(api.navigationHint('text'),'Type/Paste Input · ← Delete · Enter Continue · Esc/Backspace Back');
 assert.equal(api.navigationHint('busy'),'Ctrl+C Interrupt');
});
test('home wordmark is compact, readable without ANSI and absent on inner screens',()=>{
 const home=api.renderScreen({title:'ARC',wordmark:true,rows:['Configure','Update','Uninstall','Exit'],selected:0});
 const lines=home.text.split('\n');assert.ok(lines.length<=12);assert.doesNotMatch(home.text,/^[ \t]*ARC[ \t]*$/m);assert.deepEqual(lines.slice(0,5),['╔════╗  ╦════╗  ╔════╗','║    ║  ║    ║  ║     ','╠════╣  ╠══╦═╝  ║     ','║    ║  ║  ║    ║     ','╨    ╨  ╨  ╚══  ╚════╝']);assert.ok(lines.slice(0,5).every(line=>[...line].length===22));assert.doesNotMatch(home.text,/[█▀▄]/);assert.match(lines[5],/^─+$/);assert.equal(lines[5].length,34);assert.equal(lines[6].length,34);assert.doesNotMatch(home.text,/\x1b/);
 assert.ok(home.styles.length>0);assert.doesNotMatch(api.renderScreen({title:'Configure',rows:['Install / Reconfigure']}).text,/[█▀▄]/);
 assert.equal(api.renderScreen({title:'ARC',wordmark:true,rows:['Apply'],requiresConfirmation:true},{columns:80,rows:4}).applyEnabled,false);
});
test('detail wrapping preserves every escaped character without horizontal truncation',()=>{
 assert.equal(typeof api.wrapDetailRows,'function');const source='/tmp/'+('long/').repeat(30)+'END\x1b[2J\rnote';const lines=api.wrapDetailRows([source],24);
 assert.equal(lines.join(''),api.escapeTerminalText(source));assert.ok(lines.every(line=>line.length<=21));
 const wide=api.wrapDetailRows(['가나다라마바사아자차카타파하'],12);assert.equal(wide.join(''),'가나다라마바사아자차카타파하');assert.ok(wide.every(line=>[...line].length<=4));
});
test('outline and green rule do not falsely block confirmation after terminal grows',()=>{
 const screen={title:'ARC',wordmark:true,rows:['Destination','Changes','Apply'],requiresConfirmation:true};
 assert.equal(api.renderScreen(screen,{columns:80,rows:3}).applyEnabled,false);
 const expanded=api.renderScreen(screen,{columns:80,rows:24});assert.equal(expanded.applyEnabled,true);assert.equal(expanded.text.split('\n')[5].length,34);
});

test('five-row ARC home fits status and all four actions with footer in 24 rows',()=>{
 const screen={title:'ARC',wordmark:true,rows:['Codex: Installed','Claude: Not installed','Configure','Update','Uninstall','Exit'],selected:2,requiresConfirmation:true};
 const rendered=api.renderScreen(screen,{columns:80,rows:24});assert.equal(rendered.applyEnabled,true);assert.equal(rendered.text.split('\n').length,13);assert.match(rendered.text,/> Configure/);assert.match(rendered.text,/Exit/);assert.match(rendered.text,/Esc Back$/);
});
