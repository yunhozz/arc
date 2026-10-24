// Treat all screen content as data. Only terminal.mjs emits terminal commands.
export function escapeTerminalText(value=''){
 return String(value).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,character=>{
  const code=character.codePointAt(0);return code<=255?'\\x'+code.toString(16).padStart(2,'0'):'\\u{'+code.toString(16)+'}';
 });
}
function width(character){return /[\p{Mark}]/u.test(character)?0:/[\u2190-\u2193\u2500-\u257f\u2588]/u.test(character)?1:character.codePointAt(0)>=0x1100?2:1;}
function fit(text,columns){let used=0,result='';for(const character of text){const size=width(character);if(used+size>columns)return{text:result,complete:false};result+=character;used+=size;}return{text:result,complete:true};}
export function navigationHint(mode='menu',{backLabel='back',hasNext=false}={}){
 if(mode==='text')return'Type/Paste Input · ← Delete · Enter Continue · Esc/Backspace Back';
 if(mode==='busy')return'Ctrl+C Interrupt';
 if(mode==='page'||mode==='reviewPage')return'↑/↓: Scroll · Enter '+(mode==='page'?'Back':hasNext?'Next':'Continue')+' · Esc Back';
 return'↑/↓: Select · Enter Continue · Esc '+(backLabel==='exit'?'Exit':'Back');
}
export function wrapDetailRows(rows,columns){
 const available=Math.max(2,Math.floor(Number(columns)||80)-3),result=[];
 for(const row of rows){const escaped=escapeTerminalText(row);let line='',used=0;for(const character of escaped){const size=width(character);if(used+size>available){result.push(line);line='';used=0;}line+=character;used+=size;}result.push(line);}
 return result;
}
const wordmark=['  █████    ███████     ███████ ','██     ██  ██    ██   ██       ','█████████  ███████    ██       ','██     ██  ██   ██    ██       ','██     ██  ██    ██    ███████ '];
const logoStart=Math.min(...wordmark.map(row=>row.indexOf('█'))),logoEnd=Math.max(...wordmark.map(row=>row.lastIndexOf('█')));
const logoStops=[[183,228,199],[116,198,157],[64,145,108]];
function logoColor(column){const position=(column-logoStart)/(logoEnd-logoStart)*2,segment=Math.min(1,Math.floor(position)),fraction=position-segment;return logoStops[segment].map((value,index)=>Math.round(value+(logoStops[segment+1][index]-value)*fraction));}

export function renderScreen(screen={}, {columns=80,rows=24}={}){
 // Leave the last column unused to avoid terminal autowrap at the right edge.
 columns=Math.max(1,Math.floor(Number(columns)||80)-1);rows=Math.max(1,Math.floor(Number(rows)||24));
 const entries=screen.rows??[],hint=screen.hint??navigationHint('menu');
 const heading=screen.wordmark?[...wordmark,'─'.repeat(Math.min(columns,34))]:[escapeTerminalText(screen.title)],position=screen.position?[escapeTerminalText(screen.position)]:[];
 const lines=[...heading,...entries.map((row,index)=>(index===screen.selected?'> ':'  ')+escapeTerminalText(row)),...position,escapeTerminalText(hint)];
 const fitted=lines.map(line=>fit(line,columns));
 const required=screen.requiredRows??entries.map((_,index)=>index);
 const requiredVisible=required.every(index=>Number.isInteger(index)&&index>=0&&index<entries.length&&index+heading.length<rows-1-position.length&&fitted[index+heading.length].complete);
 const applyEnabled=!screen.requiresConfirmation||(requiredVisible&&heading.every((_,index)=>fitted[index].complete)&&lines.length<=rows&&fitted.at(-1).complete&&position.every((_,index)=>fitted[lines.length-2-index].complete));
 const visible=fitted.slice(0,rows).map(line=>line.text);
 if(!applyEnabled)visible[visible.length-1]=fit('Resize terminal to review before applying.',columns).text;
 const styles=[];
 if(screen.wordmark){for(let index=0;index<Math.min(wordmark.length,visible.length);index++){if(visible[index]===fitted[index].text)styles.push({line:index,color:'logo',cells:[...visible[index]].flatMap((character,column)=>character==='█'?[{column,rgb:logoColor(column)}]:[])});}if(visible.length>wordmark.length&&visible[wordmark.length]===fitted[wordmark.length].text)styles.push({line:wordmark.length,color:'green'});}
 const selectedLine=heading.length+screen.selected;
 if(Number.isInteger(screen.selected)&&screen.selected>=0&&screen.selected<entries.length&&selectedLine<visible.length&&!(screen.requiresConfirmation&&!applyEnabled&&selectedLine===visible.length-1)){const used=[...visible[selectedLine]].reduce((sum,character)=>sum+width(character),0);visible[selectedLine]+=' '.repeat(Math.max(0,Math.min(columns,34)-used));styles.push({line:selectedLine,color:'selected'});}

 const selectionEnabled=Number.isInteger(screen.selected)&&screen.selected>=0&&screen.selected<entries.length&&selectedLine<rows-1-position.length&&fitted[selectedLine].complete;
 return{text:visible.join('\n'),applyEnabled,selectionEnabled,styles};
}
