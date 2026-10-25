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
 assert.equal(api.navigationHint('menu'),'↑/↓: Select · Enter Continue · Esc Home');
 assert.equal(api.navigationHint('menu',{backLabel:'exit'}),'↑/↓: Select · Enter Continue · Esc Exit');
 assert.equal(api.navigationHint('page'),'↑/↓: Scroll · Enter Back · Esc Home');
 assert.equal(api.navigationHint('reviewPage',{hasNext:true}),'↑/↓: Scroll · Enter Next · Esc Home');
 assert.equal(api.navigationHint('reviewPage'),'↑/↓: Scroll · Enter Continue · Esc Home');
 assert.equal(api.navigationHint('text'),'↑/↓: Select · Type/Paste Input · Backspace Delete · Enter Continue · Esc Home');
 assert.equal(api.navigationHint('busy'),'Ctrl+C Interrupt');
});
test('home wordmark is compact, readable without ANSI and absent on inner screens',()=>{
 const home=api.renderScreen({title:'ARC',wordmark:true,rows:['Configure','Update','Uninstall','Exit'],selected:0});
 const lines=home.text.split('\n');assert.ok(lines.length<=14);assert.doesNotMatch(home.text,/^[ \t]*ARC[ \t]*$/m);assert.deepEqual(lines.slice(0,5),['  █████    ███████     ███████ ', '██     ██  ██    ██   ██       ', '█████████  ███████    ██       ', '██     ██  ██   ██    ██       ', '██     ██  ██    ██    ███████ ']);assert.ok(lines.slice(0,5).every(line=>[...line].length===31));assert.doesNotMatch(home.text,/#/);assert.match(lines[5],/^─+$/);assert.equal(lines[5].length,34);assert.equal(lines[6].length,34);assert.doesNotMatch(home.text,/\x1b/);
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
 const rendered=api.renderScreen(screen,{columns:80,rows:24});assert.equal(rendered.applyEnabled,true);assert.equal(rendered.text.split('\n').length,15);assert.match(rendered.text,/> Configure/);assert.match(rendered.text,/Exit/);assert.match(rendered.text,/Esc Home$/);
});

test('pixel logo metadata colors only its visible filled cells and keeps gradient stops across its width',()=>{
 const rendered=api.renderScreen({title:'ARC',wordmark:true,rows:['Configure'],selected:0});const lines=rendered.text.split('\n');
 const logo=rendered.styles.filter(style=>style.color==='logo');assert.equal(logo.length,5);
 for(const style of logo){for(const cell of style.cells){assert.equal(lines[style.line][cell.column] ,'█');assert.equal(cell.rgb.length,3);}}
 assert.deepEqual(logo[2].cells.find(cell=>cell.column===0).rgb,[183,228,199]);assert.deepEqual(logo[0].cells.find(cell=>cell.column===15).rgb,[114,196,155]);assert.deepEqual(logo[0].cells.find(cell=>cell.column===29).rgb,[64,145,108]);
 assert.ok(logo.every(style=>!style.cells.some(cell=>cell.column===30)));
 const clipped=api.renderScreen({title:'ARC',wordmark:true,rows:['Apply'],requiresConfirmation:true},{columns:8,rows:3});assert.equal(clipped.applyEnabled,false);assert.ok(!clipped.styles.some(style=>style.line===2&&style.color==='logo'));assert.doesNotMatch(rendered.text,/\x1b/);
});

test('filled logo uses single-column blocks and clipped metadata tracks only visible cells',()=>{
 const screen={title:'ARC',wordmark:true,rows:['Apply'],hint:'Back',requiresConfirmation:true};
 assert.equal(api.renderScreen(screen,{columns:32,rows:24}).applyEnabled,true);assert.equal(api.renderScreen(screen,{columns:31,rows:24}).applyEnabled,false);
 const clipped=api.renderScreen({...screen,requiresConfirmation:false},{columns:12,rows:24});const lines=clipped.text.split('\n');
 for(const style of clipped.styles.filter(style=>style.color==='logo')){assert.ok(lines[style.line].length<=11);assert.equal(style.cells.length,[...lines[style.line]].filter(character=>character==='█').length);assert.ok(style.cells.every(cell=>cell.column<11&&lines[style.line][cell.column]==='█'));}
});

test('responsive footer remains outside selectable rows',()=>{for(const columns of [40,80,120]){const screen={title:'Menu',rows:['One','Two'],selected:1};const result=api.renderScreen(screen,{columns,rows:24});const lines=result.text.split('\n');assert.equal(lines.at(-3),'');assert.equal(lines.at(-2),'─'.repeat(columns-1));assert.equal(screen.rows.length,2);assert.equal(result.selectionEnabled,true);}});
test('footer reserves space and blocks hidden selected actions',()=>{assert.equal(api.renderScreen({title:'Menu',rows:['Apply'],selected:0},{columns:80,rows:4}).selectionEnabled,false);});

test('small viewport pins footer without allowing hidden required information to apply',()=>{const result=api.renderScreen({title:'Menu',rows:['Required information','Apply'],selected:1,requiresConfirmation:true},{columns:100,rows:4});assert.equal(result.applyEnabled,false);assert.equal(result.selectionEnabled,false);assert.equal(result.text.split('\n').at(-1),'↑/↓: Select · Enter Continue · Esc Home');assert.equal(result.text.split('\n').at(-2),'─'.repeat(99));});
