import test from 'node:test';
import assert from 'node:assert/strict';
import {formatLine} from '../../lib/tui/terminal.mjs';
const api=await import('../../lib/tui/render.mjs').catch(()=>({}));
test('renderer escapes injected terminal controls in every user-visible field',()=>{
 assert.equal(typeof api.renderScreen,'function');
 const rendered=api.renderScreen({title:'Home\x1b]52;x\x07',rows:['a\rb\tc\n\x9bd'],hint:'Help\x1b[2J',selected:0},{columns:80,rows:24});
 assert.doesNotMatch(rendered.text,/[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
 assert.match(rendered.text,/\\x1b\]52/);assert.match(rendered.text,/a\\x0db\\x09c\\x0a/);assert.match(rendered.text,/Help\\x1b\[2J/);
});
test('shared hints exactly describe menu, page, input and busy controls',()=>{
 assert.equal(typeof api.navigationHint,'function');
 assert.equal(api.navigationHint('menu'),'↑/↓: Select · Enter Continue · Esc Home');
 assert.equal(api.navigationHint('menu',{backLabel:'exit'}),'↑/↓: Select · Enter Continue · Esc Exit');
 assert.equal(api.navigationHint('page'),'↑/↓: Scroll · Enter Back · Esc Home');
 assert.equal(api.navigationHint('text'),'↑/↓: Select · Type/Paste Input · Backspace Delete · Enter Continue · Esc Home');
 assert.equal(api.navigationHint('busy'),'Ctrl+C Interrupt');
});
test('detail wrapping preserves every escaped character without horizontal truncation',()=>{
 assert.equal(typeof api.wrapDetailRows,'function');const source='/tmp/'+('long/').repeat(30)+'END\x1b[2J\rnote';const lines=api.wrapDetailRows([source],24);
 assert.equal(lines.join(''),api.escapeTerminalText(source));assert.ok(lines.every(line=>line.length<=21));
 const wide=api.wrapDetailRows(['ＡＢＣＤＥＦＧＨＩＪＫＬＭＮ'],12);assert.equal(wide.join(''),'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮ');assert.ok(wide.every(line=>[...line].length<=4));
});
test('responsive footer remains outside selectable rows',()=>{for(const columns of [40,80,120]){const screen={title:'Menu',rows:['One','Two'],selected:1};const result=api.renderScreen(screen,{columns,rows:24});const lines=result.text.split('\n');assert.equal(lines.at(-3),'');assert.equal(lines.at(-2),'─'.repeat(columns-1));assert.equal(screen.rows.length,2);assert.equal(result.selectionEnabled,true);}});
test('footer reserves space and blocks hidden selected actions',()=>{assert.equal(api.renderScreen({title:'Menu',rows:['Apply'],selected:0},{columns:80,rows:4}).selectionEnabled,false);});

test('small viewport pins footer and blocks hidden actions',()=>{const result=api.renderScreen({title:'Menu',rows:['Required information','Apply'],selected:1},{columns:100,rows:4});assert.equal(result.selectionEnabled,false);assert.equal(result.text.split('\n').at(-1),'↑/↓: Select · Enter Continue · Esc Home');assert.equal(result.text.split('\n').at(-2),'─'.repeat(99));});

test('renderer returns selection safety without Review confirmation API or warning',()=>{const result=api.renderScreen({title:'Settings',rows:['Apply'],selected:0},{columns:80,rows:4});assert.equal('applyEnabled' in result,false);assert.equal(result.selectionEnabled,false);assert.doesNotMatch(result.text,/Resize terminal to review/);});

const shadowLogo=[' █████╗ ██████╗  ██████╗','██╔══██╗██╔══██╗██╔════╝','███████║██████╔╝██║     ','██╔══██║██╔══██╗██║     ','██║  ██║██║  ██║╚██████╗','╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝'];
test('home heading renders the six-row shadow logo, tagline and 38-column rule',()=>{
 const result=api.renderScreen({title:'ARC',wordmark:true,version:'0.3.0',rows:['Install / Update'],selected:0}),lines=result.text.split('\n');
 assert.deepEqual(lines.slice(0,6),shadowLogo);assert.equal(lines[6],' ✦ agent role coordination   ver 0.3.0');assert.equal(lines[7],'─'.repeat(38));assert.doesNotMatch(result.text,/\x1b/);assert.ok(lines.length<=16);
 const full=api.renderScreen({wordmark:true,rows:['Codex: Installed','Claude: Not installed','Configure','Update','Uninstall','Exit'],selected:2});assert.equal(full.text.split('\n').length,17);
});
test('tagline falls back to version only, then clips',()=>{
 assert.equal(api.renderScreen({wordmark:true,version:'0.3.0'},{columns:31,rows:24}).text.split('\n')[6],' ✦ ver 0.3.0');
 assert.equal(api.renderScreen({wordmark:true},{columns:27,rows:24}).text.split('\n')[6],' ✦ agent role coordination');
});
test('narrow or short viewport uses the two-row compact heading',()=>{
 assert.equal(api.wordmarkRows({columns:80,rows:24}),8);assert.equal(api.wordmarkRows({columns:24,rows:24}),2);assert.equal(api.wordmarkRows({columns:80,rows:17}),2);
 const result=api.renderScreen({wordmark:true,version:'0.3.0'},{columns:24,rows:24}),lines=result.text.split('\n');assert.equal(lines[0],'ARC ✦ ver 0.3.0');assert.equal(lines[1],'─'.repeat(23));
 assert.deepEqual(result.styles[0].runs.slice(0,3).map(run=>run.fg),[[178,245,214],[81,221,168],[16,185,129]]);
});
test('cellWidth counts box drawing, sparkle and braille as one column',()=>{
 for(const character of ['═','✦','✧','⠋','─','█','▟','←'])assert.equal(api.cellWidth(character),1);assert.equal(api.cellWidth('Ａ'),2);assert.equal(api.cellWidth('\u0301'),0);
});
test('gradient stops are pinned',()=>{
 for(const [t,want] of [[-1,[178,245,214]],[0,[178,245,214]],[1/3,[110,231,183]],[2/3,[52,211,153]],[1,[16,185,129]],[2,[16,185,129]]])assert.deepEqual(api.gradientAt(t),want);
});
test('logo runs color filled and shadow cells only',()=>{
 const result=api.renderScreen({wordmark:true}),lines=result.text.split('\n');
 for(let row=0;row<6;row++){const runs=result.styles.find(style=>style.line===row).runs;for(let col=0;col<[...lines[row]].length;col++){
  const character=[...lines[row]][col],run=runs.find(run=>run.from<=col&&col<run.to);if(character===' '){assert.equal(run,undefined);continue;}
  assert.equal(run.role,character==='█'?'logo':'shadow');const color=api.gradientAt((col+0.75*row)/26.75);assert.deepEqual(run.fg,character==='█'?color:color.map(value=>Math.round(value*0.55)));
 }}
 assert.deepEqual(result.styles[0].runs[0].fg,[170,243,211]);
});
test('selected row is one contiguous run with a padded tail',()=>{
 const result=api.renderScreen({title:'Menu',rows:['Configure'],selected:0}),line=result.text.split('\n')[1],runs=result.styles.find(style=>style.line===1).runs;
 assert.equal(line.length,38);assert.deepEqual(runs[0],{from:0,to:11,role:'selected',fg:[236,253,245],bg:[6,95,70],bold:true});assert.equal(runs.length,2);assert.deepEqual(runs[1],{from:11,to:38,role:'selectedPad',bg:[9,70,53]});
});
test('hint segments and separators are separate runs',()=>{
 const result=api.renderScreen({title:'Menu',position:'1-2/3'}),lines=result.text.split('\n'),runs=result.styles.find(style=>style.line===lines.length-1).runs;
 assert.deepEqual(runs.map(run=>[lines.at(-1).slice(run.from,run.to),run.role,run.fg]),[['↑/↓: Select','hint',[150,170,160]],[' · ','hintSep',[70,95,85]],['Enter Continue','hint',[150,170,160]],[' · ','hintSep',[70,95,85]],['Esc Home','hint',[150,170,160]]]);
 assert.deepEqual(result.styles.find(style=>style.line===1).runs,[{from:0,to:5,role:'position',fg:[110,130,120]}]);
});
test('title uses a bold mint run on inner screens',()=>{
 const result=api.renderScreen({title:'Check Version',rows:['Upgrade','Back'],selected:0});assert.deepEqual(result.styles[0],{line:0,runs:[{from:0,to:13,role:'title',fg:[110,231,183],bold:true}]});assert.equal(result.text.split('\n').length,6);
});
test('rules use the pinned gradients',()=>{
 const result=api.renderScreen({wordmark:true}),lines=result.text.split('\n'),home=result.styles.find(style=>style.line===7).runs,footer=result.styles.find(style=>style.line===lines.length-2).runs;
 const colorAt=(runs,col)=>runs.find(run=>run.from<=col&&col<run.to).fg;
 assert.equal(lines[7].length,38);assert.deepEqual(colorAt(home,0),[178,245,214]);assert.deepEqual(colorAt(home,37),[23,66,51]);assert.deepEqual(footer,[{from:0,to:79,role:'rule',fg:[36,140,106]}]);
 for(const runs of [home,footer])for(let i=1;i<runs.length;i++)assert.notDeepEqual(runs[i-1].fg,runs[i].fg);
});
test('visible runs stay sorted, nonoverlapping and bounded after clipping',()=>{
 for(const columns of [8,24,27,80])for(const rows of [3,17,24]){const result=api.renderScreen({wordmark:true,rows:['Ａ😀 Configure','Back'],selected:0,position:'1/2'},{columns,rows}),lines=result.text.split('\n');assert.equal(new Set(result.styles.map(style=>style.line)).size,result.styles.length);for(const style of result.styles){let end=0;for(const run of style.runs){assert.ok(run.from>=end);assert.ok(run.to>run.from&&run.to<=[...lines[style.line]].length);end=run.to;}}}
});

test('clipped tagline retains its visible color run and full heading colors stay distinct',()=>{
 const clipped=api.renderScreen({wordmark:true},{columns:25,rows:24});assert.deepEqual(clipped.styles.find(style=>style.line===6).runs.at(-1),{from:3,to:24,role:'tagline',fg:[134,176,158]});
 const full=api.renderScreen({wordmark:true,version:'0.3.0'});assert.deepEqual(full.styles.find(style=>style.line===6).runs,[{from:1,to:2,role:'sparkle',fg:[143,237,199]},{from:3,to:26,role:'tagline',fg:[134,176,158]},{from:29,to:38,role:'version',fg:[52,211,153]}]);
});


test('inner truecolor frames stay within the PTY output budget',()=>{
 const result=api.renderScreen({title:'Uninstall',rows:['Codex','Claude','Everything (incl. CLI)','Back'],selected:2},{columns:120,rows:40});
 const bytes=result.text.split('\n').reduce((total,line,index)=>total+Buffer.byteLength(formatLine(line,result.styles.find(style=>style.line===index),'truecolor')),0);assert.ok(bytes<800,`Frame uses ${bytes} bytes; expected fewer than 800`);
});
