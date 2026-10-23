// Treat all screen content as data. Only terminal.mjs emits terminal commands.
export function escapeTerminalText(value=''){
 return String(value).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,character=>{
  const code=character.codePointAt(0);return code<=255?'\\x'+code.toString(16).padStart(2,'0'):'\\u{'+code.toString(16)+'}';
 });
}
function width(character){return /[\p{Mark}]/u.test(character)?0:character.codePointAt(0)>=0x1100?2:1;}
function fit(text,columns){let used=0,result='';for(const character of text){const size=width(character);if(used+size>columns)return{text:result,complete:false};result+=character;used+=size;}return{text:result,complete:true};}
export function renderScreen(screen={}, {columns=80,rows=24}={}){
 // Leave the last column unused to avoid terminal autowrap at the right edge.
 columns=Math.max(1,Math.floor(Number(columns)||80)-1);rows=Math.max(1,Math.floor(Number(rows)||24));
 const entries=screen.rows??[],hint=screen.hint??'Up/Down: select | Enter: continue | Esc: back';
 const lines=[escapeTerminalText(screen.title),...entries.map((row,index)=>(index===screen.selected?'> ':'  ')+escapeTerminalText(row)),escapeTerminalText(hint)];
 const fitted=lines.map(line=>fit(line,columns));
 const required=screen.requiredRows??entries.map((_,index)=>index);
 const requiredVisible=required.every(index=>Number.isInteger(index)&&index>=0&&index<entries.length&&index+1<rows-1&&fitted[index+1].complete);
 const applyEnabled=!screen.requiresConfirmation||(requiredVisible&&fitted[0].complete&&lines.length<=rows&&fitted.at(-1).complete);
 const visible=fitted.slice(0,rows).map(line=>line.text);
 if(!applyEnabled)visible[visible.length-1]=fit('Resize terminal to review before applying.',columns).text;
 return{text:visible.join('\n'),applyEnabled};
}
