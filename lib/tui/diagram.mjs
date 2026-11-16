import {installerRegistryOf,platformLabel} from '../platforms/index.mjs';
import {escapeTerminalText,cellWidth,wrapDetailRows} from './render.mjs';

const cells=value=>[...value].reduce((total,character)=>total+cellWidth(character),0);

function shorten(value,limit){
 if(cells(value)<=limit)return value;
 const suffix=cells('…')<=limit?'…':'';let result='',used=0;
 for(const character of value){
  const size=cellWidth(character);
  if(used+size>Math.max(0,limit-cells(suffix)))break;
  result+=character;used+=size;
 }
 return result+suffix;
}

function viewportGuard({columns,rows}){
 const availableRows=Math.max(0,rows-1),availableColumns=columns-3;
 const wrap=value=>availableColumns===1?[...value]:wrapDetailRows([value],columns);
 const full=wrap('Menu requires 40 columns and 16 rows.'),short=wrap('Requires 40x16.'),minimum=wrap('40x16');
 const guidance=full.length<=availableRows?full:short.length<=availableRows?short:minimum;
 return {mode:'guard',rows:guidance.slice(0,availableRows)};
}

export function diagramRows(roleRows,{columns=80,rows=24,selectedRole,blink=true,blocked=new Set(),footerRows=6,registry=installerRegistryOf()}={}){
 if(columns<40||rows<16)return viewportGuard({columns,rows});
 const values=roleRows.map(({role,platform,model,effort},index)=>({
  label:escapeTerminalText(role)+(blocked.has(index)?' !':''),
  platform:escapeTerminalText(platformLabel(platform,registry)),
  model:escapeTerminalText(model),effort:escapeTerminalText(effort),
 }));
 const width=Math.max(20,...values.flatMap(value=>[
  cells(value.label)+4,cells(value.platform),cells(value.model),cells('effort: '+value.effort),
 ])),boxWidth=width+4,total=boxWidth*3+4;
 if(columns<boxWidth*3+7||rows<24||13+footerRows+5>rows){
  const available=Math.max(2,Math.floor(Number(columns)||80)-3);
  const roleRow=value=>{
   const model=value.platform+' / '+value.model,prefix=value.label+': ',room=Math.max(0,available-cells(prefix)-cells(' / '));
   const modelLimit=Math.min(cells(model),Math.ceil(room/2)),effortLimit=Math.min(cells(value.effort),room-modelLimit);
   return shorten(prefix+shorten(model,room-effortLimit)+' / '+shorten(value.effort,effortLimit),available);
  };
  return {mode:'compact',rows:[...values.map(roleRow),'']};
 }
 const center=Math.floor(boxWidth/2),middle=boxWidth+2+center,right=2*(boxWidth+2)+center;
 const indent=Math.floor((total-(boxWidth*2+2))/2),bottomLeft=indent+center,bottomRight=bottomLeft+boxWidth+2;
 const box=(value,index,up)=>{
  const hidden=index===selectedRole&&!blink,edge=hidden?' ':'│';
  const top=hidden?'   '+value.label+' '.repeat(boxWidth-3-cells(value.label)):'┌─ '+value.label+' '+'─'.repeat(boxWidth-cells(value.label)-5)+'┐';
  const bottom=Array(boxWidth).fill(hidden?' ':'─');
  if(!hidden){bottom[0]='└';bottom[boxWidth-1]='┘';if(!up)bottom[center]='┬';}
  return [top,...[value.platform,value.model,'effort: '+value.effort].map(text=>edge+' '+text+' '.repeat(width-cells(text))+' '+edge),bottom.join('')];
 };
 const group=(indices,indent,up)=>{
  const boxes=indices.map(index=>box(values[index],index,up));
  return Array.from({length:5},(_,row)=>' '.repeat(indent)+boxes.map(lines=>lines[row]).join('  '));
 };
 const bus=(left,right,branches,up=false)=>{
  const line=Array(total).fill(' ');
  for(let index=left;index<=right;index++)line[index]='─';
  for(const index of branches)line[index]=index===middle?'┼':up?'┴':'┬';
  return line.join('').trimEnd();
 };
 return {mode:'full',rows:[
  ...group([0,1,2],0,false),bus(center,right,[center,middle,right],true),
  ' '.repeat(Math.max(0,middle-6))+'Orchestrator',bus(bottomLeft,bottomRight,[bottomLeft,middle,bottomRight]),
  ...group([3,4],indent,true),
 ]};
}
