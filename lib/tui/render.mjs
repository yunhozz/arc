// Treat all screen content as data. Only terminal.mjs emits terminal commands.
export function escapeTerminalText(value=''){
 return String(value).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,character=>{
  const code=character.codePointAt(0);return code<=255?'\\x'+code.toString(16).padStart(2,'0'):'\\u{'+code.toString(16)+'}';
 });
}
function width(character){return /[\p{Mark}]/u.test(character)?0:character.codePointAt(0)>=0x1100?2:1;}
function fit(text,columns){let used=0,result='';for(const character of text){const size=width(character);if(used+size>columns)return{text:result,complete:false};result+=character;used+=size;}return{text:result,complete:true};}
export function navigationHint(mode='menu',{backLabel='back',hasNext=false}={}){
 if(mode==='text')return'Type/paste: input | Left: delete | Enter: continue | Esc/Backspace: back';
 if(mode==='busy')return'Ctrl+C: interrupt';
 if(mode==='page'||mode==='reviewPage')return'Up/Down: scroll | Enter: '+(mode==='page'?'back':hasNext?'next':'continue')+' | Esc: back';
 return'Up/Down: select | Enter: continue | Esc: '+backLabel;
}
export function wrapDetailRows(rows,columns){
 const available=Math.max(2,Math.floor(Number(columns)||80)-3),result=[];
 for(const row of rows){const escaped=escapeTerminalText(row);let line='',used=0;for(const character of escaped){const size=width(character);if(used+size>available){result.push(line);line='';used=0;}line+=character;used+=size;}result.push(line);}
 return result;
}
const wordmark=[' ▄▀▀▄  █▀▀▄  ▄▀▀▀',' █▄▄█  █▄▄▀  █   ',' █  █  █  █  ▀▄▄▄'];
export function renderScreen(screen={}, {columns=80,rows=24}={}){
 // Leave the last column unused to avoid terminal autowrap at the right edge.
 columns=Math.max(1,Math.floor(Number(columns)||80)-1);rows=Math.max(1,Math.floor(Number(rows)||24));
 const entries=screen.rows??[],hint=screen.hint??navigationHint('menu');
 const heading=[...(screen.wordmark?wordmark:[]),escapeTerminalText(screen.title)],position=screen.position?[escapeTerminalText(screen.position)]:[];
 const lines=[...heading,...entries.map((row,index)=>(index===screen.selected?'> ':'  ')+escapeTerminalText(row)),...position,escapeTerminalText(hint)];
 const fitted=lines.map(line=>fit(line,columns));
 const required=screen.requiredRows??entries.map((_,index)=>index);
 const requiredVisible=required.every(index=>Number.isInteger(index)&&index>=0&&index<entries.length&&index+heading.length<rows-1-position.length&&fitted[index+heading.length].complete);
 const applyEnabled=!screen.requiresConfirmation||(requiredVisible&&heading.every((_,index)=>fitted[index].complete)&&lines.length<=rows&&fitted.at(-1).complete&&position.every((_,index)=>fitted[lines.length-2-index].complete));
 const visible=fitted.slice(0,rows).map(line=>line.text);
 if(!applyEnabled)visible[visible.length-1]=fit('Resize terminal to review before applying.',columns).text;
 const styles=screen.wordmark?wordmark.slice(0,visible.length).map((line,index)=>({line:index,whiteEnd:index===2?Math.max(0,visible[index].length-3):visible[index].length})):[];
 return{text:visible.join('\n'),applyEnabled,styles};
}
