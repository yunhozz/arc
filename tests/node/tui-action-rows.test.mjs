import test from 'node:test';
import assert from 'node:assert/strict';
import {renderScreen} from '../../lib/tui/render.mjs';
import {formatLine} from '../../lib/tui/terminal.mjs';
import {createTuiInterface} from '../../lib/tui/app.mjs';

const base={title:'Actions',rows:['One','Two','Three','Save','Back'],selected:0};
const kinds=[undefined,undefined,undefined,'confirm','cancel'];
const render=(screen,viewport={columns:80,rows:24})=>renderScreen(screen,viewport);
const lines=result=>result.text.split('\n');
const rolesAt=(result,line)=>result.styles.find(style=>style.line===line)?.runs??[];

test('rowKinds absent or all undefined renders byte-identical output',()=>{
 assert.deepEqual(render({...base,rowKinds:Array(5).fill(undefined)}),render(base));
});
test('blank line is inserted once before the action group',()=>{
 const result=render({...base,rowKinds:kinds});
 assert.deepEqual(lines(result).slice(2,8),['  Two','  Three','  ','  Save','  Back','']);
 assert.equal(lines(result).length,10);
});
test('blank line is skipped when the previous row is blank',()=>{
 const screen={title:'Input',mode:'text',rows:['value','','Save','Back',''],selected:2};
 assert.equal(render({...screen,rowKinds:[undefined,undefined,'confirm','cancel',undefined]}).text,render(screen).text);
});
test('blank line is skipped when position is shown',()=>{
 const screen={...base,position:'1-5/9'};
 assert.equal(render({...screen,rowKinds:kinds}).text,render(screen).text);
});
test('blank line is skipped when it would overflow rows',()=>{
 const screen={...base,selected:4,notices:['Notice']},viewport={columns:80,rows:10};
 const result=render({...screen,rowKinds:kinds},viewport);
 assert.equal(result.text,render(screen,viewport).text);
 assert.equal(lines(result).length,10);assert.equal(result.selectionEnabled,true);
 assert.match(result.text,/> Back/);
});
test('selected action row uses the selected bar on the shifted line',()=>{
 const screen=structuredClone({...base,selected:4,rowKinds:kinds}),before=structuredClone(screen);
 const result=render(screen);
 assert.deepEqual(screen,before);assert.equal(result.selectionEnabled,render({...base,selected:4}).selectionEnabled);
 assert.equal(lines(result)[4],'  ');assert.match(lines(result)[6],/^> Back/);
 assert.deepEqual(rolesAt(result,6).map(run=>run.role),['selected','selectedPad']);
});
test('unselected action rows use action roles',()=>{
 const result=render({title:'Actions',rows:['One','Save','Back','Remove'],rowKinds:[undefined,'confirm','cancel','danger'],rowTones:[undefined,'note','note','note'],selected:0});
 for(const [line,to,role,fg,bold]of [[3,6,'actionConfirm',[52,211,153],true],[4,6,'actionCancel',[150,170,160],undefined],[5,8,'actionDanger',[248,113,113],undefined]]){
  assert.deepEqual(rolesAt(result,line),[{from:2,to,role,fg,...(bold?{bold}: {})}]);
 }
});
test('rowTones stay aligned after an inserted blank line',()=>{
 const result=render({title:'Status',rows:['Codex Available','Upgrade','Back','Codex Unauthorized','Tail: warning'],rowKinds:[undefined,'confirm','cancel',undefined,undefined],rowTones:['platform-status',undefined,undefined,'platform-status','diagnostic'],rowStatusSpans:[[{from:6,to:15,role:'ok'}],undefined,undefined,[{from:6,to:18,role:'error'}]],selected:2});
 assert.deepEqual(rolesAt(result,1),[{from:8,to:17,role:'ok',fg:[52,211,153]}]);
 assert.deepEqual(rolesAt(result,5).map(run=>[run.from,run.to,run.role]),[[8,20,'error']]);
 assert.deepEqual(rolesAt(result,6).map(run=>[run.from,run.to,run.role]),[[8,15,'warn']]);
});
test('depth none renders no escapes and keeps the blank line',()=>{
 const result=render({...base,rowKinds:kinds});
 const output=lines(result).map((line,index)=>formatLine(line,result.styles.find(style=>style.line===index),'none')).join('\n');
 assert.doesNotMatch(output,/\x1b/);assert.match(output,/  Three\n  \n  Save\n  Back/);
});
test('action at the first row gets no leading blank and separate groups each get one',()=>{
 const result=render({title:'Groups',rows:['Save','Middle','Back'],rowKinds:['confirm',undefined,'cancel']});
 assert.deepEqual(lines(result).slice(0,5),['Groups','  Save','  Middle','  ','  Back']);
});

function capture(events,viewport={columns:80,rows:24}){
 const screens=[];return {screens,viewport:()=>viewport,render(screen){screens.push(screen);return render(screen,viewport);},nextEvent:async()=>events.shift()??{name:'eof'}};
}
test('menu backRow marks Back as cancel and offsets kinds by information rows',async()=>{
 const session=capture([{name:'down'},{name:'enter'}]);
 assert.equal(await createTuiInterface(session).menu('Menu',['Save'],{info:['Info'],actionKinds:['confirm'],backRow:true}),null);
 assert.deepEqual(session.screens[0].rows,['Info','','Save','Back']);
 assert.deepEqual(session.screens[0].rowKinds,[undefined,undefined,'confirm','cancel']);
 assert.equal(session.screens[1].selected,3);
});
test('menu slices actionKinds with the scroll window',async()=>{
 const session=capture([{name:'up'},{name:'down'},{name:'enter'}],{columns:80,rows:8});
 assert.equal(await createTuiInterface(session).menu('Menu',['A','B','C','Save'],{selected:3,actionKinds:[,,, 'confirm'],backRow:true}),3);
 assert.deepEqual(session.screens[0].rows,['B','C','Save']);
 assert.deepEqual(session.screens[0].rowKinds,[undefined,undefined,'confirm']);
 assert.equal(session.screens[0].position,'2-4/5');
});
test('renderBody rowKinds replace menu kinds',async()=>{
 for(const body of [{rows:['Remove'],selected:0,rowKinds:['danger']},{rows:['Guard'],selected:undefined}]){
  const session=capture([{name:'escape'}]);
  await assert.rejects(()=>createTuiInterface(session).menu('Body',['Save'],{actionKinds:['confirm'],backRow:true,renderBody:()=>body}),{code:'ARC_TUI_HOME'});
  assert.deepEqual(session.screens[0].rowKinds,body.rowKinds);
 }
});
