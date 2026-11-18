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
 assert.equal(api.navigationHint('menu',{horizontal:true}),'↑/↓: Select · ←/→: Change · Enter Continue · Esc Home');
 assert.equal(api.navigationHint('menu',{horizontal:true,backLabel:'exit'}),'↑/↓: Select · ←/→: Change · Enter Continue · Esc Exit');
 assert.equal(api.navigationHint('page'),'↑/↓: Scroll · Enter Back · Esc Home');
 assert.equal(api.navigationHint('text'),'↑/↓: Select · Type/Paste Input · Backspace Delete · Enter Continue · Esc Home');
 assert.equal(api.navigationHint('busy'),'Ctrl+C Interrupt');
 assert.equal(api.navigationHint('checklist'),'↑/↓: Select · Enter Toggle · Esc Home');
});
test('detail wrapping preserves every escaped character without horizontal truncation',()=>{
 assert.equal(typeof api.wrapDetailRows,'function');const source='/tmp/'+('long/').repeat(30)+'END\x1b[2J\rnote';const lines=api.wrapDetailRows([source],24);
 assert.equal(lines.join(''),api.escapeTerminalText(source));assert.ok(lines.every(line=>line.length<=21));
 const wide=api.wrapDetailRows(['ＡＢＣＤＥＦＧＨＩＪＫＬＭＮ'],12);assert.equal(wide.join(''),'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮ');assert.ok(wide.every(line=>[...line].length<=4));
});
test('detail wrapping breaks words only when necessary and preserves hanging indentation',()=>{
 assert.deepEqual(api.wrapDetailRows(['  alpha beta gamma delta'],18),['  alpha beta','  gamma delta']);
 assert.deepEqual(api.wrapDetailRows(['• Mixed routing will move to the Claude home'],30),['• Mixed routing will move','  to the Claude home']);
 assert.deepEqual(api.wrapDetailRows(['Mode     Mixed (Claude + Codex)'],25),['Mode     Mixed (Claude','         + Codex)']);
 assert.deepEqual(api.wrapDetailRows(['Claude   abcdefghijklmnop'],18),['Claude   abcdef','         ghijkl','         mnop']);
 assert.deepEqual(api.wrapDetailRows(['','plain text'],15),['','plain text']);
 const wide=api.wrapDetailRows(['• ＡＢＣＤＥＦＧＨＩＪ'],12);
 assert.deepEqual(wide,['• ＡＢＣ','  ＤＥＦ','  ＧＨＩ','  Ｊ']);
});
test('responsive footer remains outside selectable rows',()=>{for(const columns of [40,80,120]){const screen={title:'Menu',rows:['One','Two'],selected:1};const result=api.renderScreen(screen,{columns,rows:24});const lines=result.text.split('\n');assert.equal(lines.at(-3),'');assert.equal(lines.at(-2),'─'.repeat(columns-1));assert.equal(screen.rows.length,2);assert.equal(result.selectionEnabled,true);}});
test('footer reserves space and blocks hidden selected actions',()=>{assert.equal(api.renderScreen({title:'Menu',rows:['Apply'],selected:0},{columns:80,rows:4}).selectionEnabled,false);});

test('small viewport pins footer and blocks hidden actions',()=>{const result=api.renderScreen({title:'Menu',rows:['Required information','Apply'],selected:1},{columns:100,rows:4});assert.equal(result.selectionEnabled,false);assert.equal(result.text.split('\n').at(-1),'↑/↓: Select · Enter Continue · Esc Home');assert.equal(result.text.split('\n').at(-2),'─'.repeat(99));});

test('renderer returns selection safety without Review confirmation API or warning',()=>{const result=api.renderScreen({title:'Settings',rows:['Apply'],selected:0},{columns:80,rows:4});assert.equal('applyEnabled' in result,false);assert.equal(result.selectionEnabled,false);assert.doesNotMatch(result.text,/Resize terminal to review/);});

const shadowLogo=[' █████╗ ██████╗  ██████╗','██╔══██╗██╔══██╗██╔════╝','███████║██████╔╝██║     ','██╔══██║██╔══██╗██║     ','██║  ██║██║  ██║╚██████╗','╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝'];
test('home heading renders the six-row shadow logo, tagline and 38-column rule',()=>{
 const result=api.renderScreen({title:'ARC',wordmark:true,version:'0.3.0',rows:['Configure'],selected:0}),lines=result.text.split('\n');
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
 for(const character of ['═','✦','✧','⠋','─','█','▟','←'])assert.equal(api.cellWidth(character),1);assert.equal(api.cellWidth('Ａ'),2);assert.equal(api.cellWidth('한'),2);assert.equal(api.cellWidth('\u0301'),0);
});
test('cellWidth counts the locked Hosts glyph as one column',()=>{
 assert.equal(api.cellWidth('■'),1);
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
 const result=api.renderScreen({title:'Status',rows:['Upgrade','Back'],selected:0});assert.deepEqual(result.styles[0],{line:0,runs:[{from:0,to:6,role:'title',fg:[110,231,183],bold:true}]});assert.equal(result.text.split('\n').length,6);
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

test('status tones color only state words',()=>{
 const screen={title:'ARC',wordmark:true,version:'0.3.0',rows:['Claude: Available / Codex: Not Available','Codex: boom','','Configure'],rowTones:['status','diagnostic',undefined,undefined],selected:3},result=api.renderScreen(screen);
 assert.deepEqual(result.styles.find(style=>style.line===8)?.runs,[{from:10,to:19,role:'ok',fg:[52,211,153]},{from:29,to:42,role:'muted',fg:[128,128,128]}]);
 assert.deepEqual(result.styles.find(style=>style.line===9)?.runs,[{from:9,to:13,role:'warn',fg:[251,191,36]}]);
 assert.equal(result.text,api.renderScreen({...screen,rowTones:undefined}).text);
 for(const [row,from,to,role,fg] of [['Claude & Codex: Available',18,27,'ok',[52,211,153]],['Codex: Unauthorized',9,21,'error',[248,113,113]],['Codex: Incomplete',9,19,'warn',[251,191,36]],['Codex: weird',9,14,'warn',[251,191,36]],['Codex: unverified',9,19,'warn',[251,191,36]]]){
  const rendered=api.renderScreen({wordmark:true,rows:[row],rowTones:['status']});assert.deepEqual(rendered.styles.find(style=>style.line===8)?.runs,[{from,to,role,fg}]);
 }
 const plain=api.renderScreen({title:'Details',rows:['Codex: Available','Codex: boom']});assert.ok(!plain.styles.some(style=>style.runs.some(run=>['ok','muted','error','warn'].includes(run.role))));
});
test('wrapped diagnostic continuation is fully warned',()=>{
 const result=api.renderScreen({wordmark:true,rows:['continued message'],rowTones:['diagnostic-cont']});assert.deepEqual(result.styles.find(style=>style.line===8)?.runs,[{from:2,to:19,role:'warn',fg:[251,191,36]}]);
 const clipped=api.renderScreen({wordmark:true,rows:['Codex: Available / Claude: Unauthorized'],rowTones:['status']},{columns:30,rows:24});assert.deepEqual(clipped.styles.find(style=>style.line===8)?.runs,[{from:9,to:18,role:'ok',fg:[52,211,153]}]);
});
test('clipping a known status never changes its tone to warning',()=>{
 const result=api.renderScreen({title:'ARC',rows:['Claude: Available / Codex: Not Available'],rowTones:['status']},{columns:35,rows:24});
 assert.deepEqual(result.styles.find(style=>style.line===1).runs,[{from:10,to:19,role:'ok',fg:[52,211,153]},{from:29,to:34,role:'muted',fg:[128,128,128]}]);
});

test('frame 0 equals no frame and rest frames equal frame 0',()=>{
 const home={wordmark:true,rows:['Exit'],selected:0},first=api.renderScreen(home);for(const frame of [0,18,35,36])assert.deepEqual(api.renderScreen({...home,frame}),first);
});
test('shimmer changes colors but never text',()=>{
 const home={wordmark:true,rows:['Exit'],selected:0},first=api.renderScreen(home),next=api.renderScreen({...home,frame:9});assert.equal(next.text,first.text);assert.notDeepEqual(next.styles,first.styles);
 assert.ok(api.shimmerIntensity(13,1,9)>0.8);assert.equal(api.shimmerIntensity(0,0,9),0);assert.equal(api.shimmerIntensity(13,1,0),0);
 const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
 for(const [row,col,role] of [[1,13,'logo'],[1,15,'shadow']]){const run=next.styles.find(style=>style.line===row).runs.find(run=>run.from<=col&&run.to>col),base=api.gradientAt((col+0.75*row)/26.75),intensity=api.shimmerIntensity(col,row,9);assert.equal(run.role,role);assert.deepEqual(run.fg,role==='logo'?mix(base,[240,255,248],0.7*intensity):mix(base.map(v=>Math.round(v*0.55)),[150,230,200],0.5*intensity));}
 assert.deepEqual(next.styles.find(style=>style.line===6).runs.find(run=>run.role==='sparkle').fg,[175,243,216]);
});
test('busy heading shows the braille spinner frame',()=>{
 const result=api.renderScreen({title:'Working',mode:'busy',rows:[],frame:3});assert.equal(result.text.split('\n')[0],'⠸ Working');assert.deepEqual(result.styles[0].runs,[{from:0,to:1,role:'spinner',fg:[52,211,153]},{from:2,to:9,role:'title',fg:[110,231,183],bold:true}]);
});

const diagramApi=await import('../../lib/tui/diagram.mjs').catch(()=>({}));
const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs');
const {diagramRegistry}=await import('./fixtures/platforms/diagram.mjs');
const diagramRoles=['Scouter','Planner','Implementer','QA','Reviewer'].map((role,index)=>({role,platform:index===1?'claude':'codex',model:index===1?'opus':'gpt-5.5',effort:['low','medium','high','medium','high'][index]}));
const diagramCells=text=>[...text].reduce((total,character)=>total+api.cellWidth(character),0);
function renderDiagram(values=diagramRoles,options={}){
 assert.equal(typeof diagramApi.diagramRows,'function');
 return diagramApi.diagramRows(values,{columns:79,rows:24,footerRows:6,...options});
}

test('diagram box shows role on top border and three inner lines',()=>{
 const result=renderDiagram();
 assert.equal(result.mode,'full');assert.equal(result.rows.length,13);
 assert.equal(result.rows[0],'┌─ Scouter '+'─'.repeat(12)+'┐  ┌─ Planner '+'─'.repeat(12)+'┐  ┌─ Implementer '+'─'.repeat(8)+'┐');
 assert.equal(result.rows[1],'│ Codex                │  │ Claude               │  │ Codex                │');
 assert.equal(result.rows[2],'│ gpt-5.5              │  │ opus                 │  │ gpt-5.5              │');
 assert.equal(result.rows[3],'│ effort: low          │  │ effort: medium       │  │ effort: high         │');
 assert.equal(result.rows[4],'└'+'─'.repeat(11)+'┬'+'─'.repeat(10)+'┘  └'+'─'.repeat(11)+'┬'+'─'.repeat(10)+'┘  └'+'─'.repeat(11)+'┬'+'─'.repeat(10)+'┘');
 assert.equal(result.rows[6],' '.repeat(32)+'Orchestrator');
 assert.match(result.rows[8],/^ {13}┌─ QA ─/);assert.match(result.rows[8],/┌─ Reviewer ─/);
 assert.equal(result.rows[5][12],'┴');assert.equal(result.rows[5][38],'┼');assert.equal(result.rows[5][64],'┴');
 assert.equal(result.rows[7][25],'┬');assert.equal(result.rows[7][38],'┼');assert.equal(result.rows[7][51],'┬');
});

test('diagram blink blanks only selected borders and keeps the role label',()=>{
 const shown=renderDiagram(diagramRoles,{selectedRole:1}),hidden=renderDiagram(diagramRoles,{selectedRole:1,blink:false});
 for(let row=0;row<5;row++){
  assert.equal(hidden.rows[row].slice(0,26),shown.rows[row].slice(0,26));
  assert.equal(hidden.rows[row].slice(50),shown.rows[row].slice(50));
  const selected=hidden.rows[row].slice(26,50);
  assert.doesNotMatch(selected,/[┌┐└┘│─┬┴]/);
  assert.equal(selected,shown.rows[row].slice(26,50).replace(/[┌┐└┘│─┬┴]/g,' '));
 }
 assert.match(shown.rows[0],/┌─ > Planner /);assert.match(hidden.rows[0],/   > Planner /);
 assert.deepEqual(shown.rows.map(diagramCells),renderDiagram().rows.map(diagramCells));
 assert.deepEqual(hidden.rows.map(diagramCells),shown.rows.map(diagramCells));
 const bottom=renderDiagram(diagramRoles,{selectedRole:4,blink:false});
 assert.match(bottom.rows[8],/Reviewer/);assert.doesNotMatch(bottom.rows[8].slice(39),/[┌┐─]/);
});

test('diagram blocked indices add an exclamation label in full and compact modes',()=>{
 const blocked=new Set([1,4]),full=renderDiagram(diagramRoles,{blocked});
 assert.match(full.rows[0],/┌─ Planner ! ─/);assert.match(full.rows[8],/┌─ Reviewer ! ─/);assert.doesNotMatch(full.rows[0],/Scouter !/);
 assert.match(renderDiagram(diagramRoles,{blocked,selectedRole:1,blink:false}).rows[0],/Planner !/);
 const compact=renderDiagram(diagramRoles,{blocked,columns:78});
 assert.equal(compact.rows[1],'Planner !: Claude / opus / medium');
 assert.equal(compact.rows[4],'Reviewer !: Codex / gpt-5.5 / high');
 assert.deepEqual([...blocked],[1,4]);
});

test('diagram thresholds include box width, viewport height and footer space',()=>{
 for(const [options,mode] of [
  [{},'full'],[{columns:78},'compact'],[{rows:23},'compact'],
  [{footerRows:7},'compact'],[{rows:25,footerRows:7},'full'],
  [{columns:39},'guard'],[{rows:15},'guard'],[{columns:40,rows:16},'compact'],
 ])assert.equal(renderDiagram(diagramRoles,options).mode,mode,JSON.stringify(options));
 assert.deepEqual(renderDiagram(diagramRoles,{columns:78}).rows,[
  'Scouter: Codex / gpt-5.5 / low','Planner: Claude / opus / medium',
  'Implementer: Codex / gpt-5.5 / high','QA: Codex / gpt-5.5 / medium','Reviewer: Codex / gpt-5.5 / high','',
 ]);
 assert.deepEqual(renderDiagram(diagramRoles,{rows:15}).rows,['Menu requires 40 columns and 16 rows.']);
 assert.deepEqual(renderDiagram(diagramRoles,{columns:10,rows:2}).rows,['40x16']);
 assert.deepEqual(renderDiagram(diagramRoles,{columns:40,rows:1}).rows,[]);
});

test('diagram resolves injected registry labels in full and compact modes',()=>{
 const {platforms:registry}=createTestRegistries(),values=diagramRoles.map(value=>({...value,platform:'zeta'}));
 assert.match(renderDiagram(values,{registry}).rows[1],/^│ Zeta +│/);
 assert.equal(renderDiagram(values,{registry,columns:78}).rows[1],'Planner: Zeta / opus / medium');
 const wideRegistry=diagramRegistry('플랫폼'.repeat(5)),wide=renderDiagram(values,{registry:wideRegistry,columns:109});
 assert.equal(wide.mode,'full');assert.match(wide.rows[1],/플랫폼플랫폼플랫폼플랫폼플랫폼/);
 for(const row of wide.rows.slice(0,5))assert.equal(diagramCells(row),106);
 assert.equal(renderDiagram(values,{registry:wideRegistry,columns:108}).mode,'compact');
});

test('diagram wide role labels and long models keep every box group aligned',()=>{
 const values=diagramRoles.map((value,index)=>({...value,role:index===0?'조사역할이름아주길게':value.role,model:'모델-아주-긴-이름-0123456789',effort:index===4?'매우높음':'medium'}));
 // The model occupies 28 cells, so each box is 32 and the full threshold is 103.
 const full=renderDiagram(values,{columns:103,blocked:new Set([0]),selectedRole:0,blink:false});
 assert.equal(full.mode,'full');assert.match(full.rows[0],/조사역할이름아주길게 !/);
 for(const row of full.rows.slice(0,5))assert.equal(diagramCells(row),100);
 for(const row of full.rows.slice(8,13))assert.equal(diagramCells(row),83);
 assert.equal(renderDiagram(values,{columns:102}).mode,'compact');
 assert.match(full.rows[2],/모델-아주-긴-이름-0123456789/);
});

test('diagram width formula includes long role labels and effort text',()=>{
 for(const [patch,columns,width] of [
  [{role:'RoleNameLongerThanTwenty'},109,106],
  [{effort:'effort-name-longer-than-twenty'},133,130],
 ]){
  const values=diagramRoles.map((value,index)=>index===0?{...value,...patch}:value);
  const result=renderDiagram(values,{columns});assert.equal(result.mode,'full');
  for(const row of result.rows.slice(0,5))assert.equal(diagramCells(row),width);
  assert.equal(renderDiagram(values,{columns:columns-1}).mode,'compact');
 }
});

test('diagram compact truncation preserves wide cells and the current effort split',()=>{
 const values=diagramRoles.map(value=>({...value,model:'모델-아주-긴-이름-0123456789',effort:'medium'}));
 const result=renderDiagram(values,{columns:40});assert.equal(result.mode,'compact');
 assert.equal(result.rows[1],'Planner: Claude / 모델-아… / medium');
 for(const row of result.rows.slice(0,5)){assert.ok(diagramCells(row)<=37);assert.match(row,/…/);assert.match(row,/ \/ medium$/);}
 const long=renderDiagram(values.map(value=>({...value,role:'역할'.repeat(20)})),{columns:40});
 for(const row of long.rows.slice(0,5)){assert.equal(diagramCells(row),36);assert.ok(row.endsWith('…'));}
});

test('diagram escapes controls in role, platform label, model and effort',()=>{
 const values=diagramRoles.map(value=>({...value,role:'역할\x1b',platform:'zeta',model:'m\r\n\x9b',effort:'x\t\u2028'}));
 const registry=diagramRegistry('Zeta\x07');
 for(const columns of [160,40]){
  const result=renderDiagram(values,{registry,columns});assert.equal(result.mode,columns===160?'full':'compact');
  const text=result.rows.join('');assert.doesNotMatch(text,/[\p{Cc}\p{Cf}\u2028\u2029]/u);
  assert.match(text,/역할\\x1b/);assert.match(text,/Zeta\\x07/);
  if(result.mode==='full'){assert.match(text,/m\\x0d\\x0a\\x9b/);assert.match(text,/x\\x09\\u\{2028\}/);}
 }
});

test('arrow values move every 5 frames (400ms) while active without changing width',()=>{
 assert.equal(typeof api.arrowValue,'function');
 for(const [frame,active,want] of [[0,true,'< KR >'],[4,true,'< KR >'],[5,true,' <KR> '],[9,true,' <KR> '],[10,true,'< KR >'],[15,true,' <KR> '],[5,false,'< KR >'],[9,false,'< KR >']]){const value=api.arrowValue('KR',frame,active);assert.equal(value,want);assert.equal(value.length,6);}
});


test('bottom notices wrap below choices and color the complete diagnostic yellow',()=>{
 const result=api.renderScreen({title:'Hosts',rows:['Claude','Done'],selected:0,notices:['Codex: authentication needs attention today']},{columns:40,rows:20});
 const lines=result.text.split('\n');
 assert.deepEqual(lines.slice(0,4).map(line=>line.trimEnd()),['Hosts','> Claude','  Done','']);
 assert.deepEqual(lines.slice(4,6),['  Codex: authentication needs attention','  today']);
 assert.equal(lines[6],'─'.repeat(39));
 const style=result.styles.find(style=>style.line===4);
 assert.equal(formatLine(lines[4],style,'16'),'\x1b[0;33m'+lines[4]+'\x1b[0m');
 assert.equal(formatLine(lines[4],style,'truecolor'),'\x1b[0;38;2;251;191;36m'+lines[4]+'\x1b[0m');
 for(const line of [4,5])assert.deepEqual(result.styles.find(style=>style.line===line)?.runs,[{from:0,to:lines[line].length,role:'warn',fg:[251,191,36]}]);
 assert.equal(result.selectionEnabled,true);
});

test('footer fitting reserves notices and disables a choice hidden by them',()=>{
 const result=api.renderScreen({title:'Menu',rows:['One','Two','Apply'],selected:2,notices:['Warning']},{columns:80,rows:7});
 assert.deepEqual(result.text.split('\n').slice(0,-2),['Menu','  One','  Two','','  Warning']);
 assert.equal(result.selectionEnabled,false);
});

test('fitChoiceRow keeps fitting rows and ellipsizes long rows to one line',()=>{
 assert.equal(api.fitChoiceRow('[ ] Claude',40),'[ ] Claude');
 const long='[-] Codex   - Unavailable  (unauthorized) (auth unverified)',fitted=api.fitChoiceRow(long,40);
 assert.ok(fitted.endsWith('…'));assert.ok([...fitted].reduce((width,character)=>width+api.cellWidth(character),0)<=37);assert.ok(long.startsWith(fitted.slice(0,-1)));
});
