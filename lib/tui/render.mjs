// Treat all screen content as data. Only terminal.mjs emits terminal commands.
export function escapeTerminalText(value=''){
 return String(value).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,character=>{
  const code=character.codePointAt(0);return code<=255?'\\x'+code.toString(16).padStart(2,'0'):'\\u{'+code.toString(16)+'}';
 });
}
export function cellWidth(character){return /[\p{Mark}]/u.test(character)?0:/[←-↓─-▟✦✧⠀-⣿]/u.test(character)?1:character.codePointAt(0)>=0x1100?2:1;}
function fit(text,columns){let used=0,result='';for(const character of text){const size=cellWidth(character);if(used+size>columns)return{text:result,complete:false};result+=character;used+=size;}return{text:result,complete:true};}
export function navigationHint(mode='menu',{backLabel='back'}={}){
 if(mode==='text')return'↑/↓: Select · Type/Paste Input · Backspace Delete · Enter Continue · Esc Home';
 if(mode==='busy')return'Ctrl+C Interrupt';
 if(mode==='page')return'↑/↓: Scroll · Enter Back · Esc Home';
 return'↑/↓: Select · Enter Continue · Esc '+(backLabel==='exit'?'Exit':'Home');
}
export function wrapDetailRows(rows,columns){
 const available=Math.max(2,Math.floor(Number(columns)||80)-3),result=[];
 for(const row of rows){const escaped=escapeTerminalText(row);let line='',used=0;for(const character of escaped){const size=cellWidth(character);if(used+size>available){result.push(line);line='';used=0;}line+=character;used+=size;}result.push(line);}
 return result;
}
const wordmark=[' █████╗ ██████╗  ██████╗','██╔══██╗██╔══██╗██╔════╝','███████║██████╔╝██║     ','██╔══██║██╔══██╗██║     ','██║  ██║██║  ██║╚██████╗','╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝'];
const STATUS_TONES=Object.freeze({'Available':'ok','Not Available':'muted','Unauthorized':'error','Incomplete':'warn'});
const TONE_FG={ok:[52,211,153],muted:[128,128,128],error:[248,113,113],warn:[251,191,36]};
const PANEL=38,STOPS=[[178,245,214],[110,231,183],[52,211,153],[16,185,129]];
const mix=(from,to,t)=>from.map((value,index)=>Math.round(value+(to[index]-value)*t));
export function gradientAt(t){const position=Math.max(0,Math.min(1,Number(t)||0))*3,segment=Math.min(2,Math.floor(position));return mix(STOPS[segment],STOPS[segment+1],position-segment);}
export function shimmerIntensity(column,row,frame){const f=frame%36;if(f>=18)return 0;const c=-4+f*33.5/17,p=column+0.5*row;return Math.max(0,1-Math.abs(p-c)/3)**2;}
export function wordmarkRows({columns=80,rows=24}={}){return columns-1>=24&&rows>=18?8:2;}

export function renderScreen(screen={}, {columns=80,rows=24}={}){
 // Leave the last column unused to avoid terminal autowrap at the right edge.
 columns=Math.max(1,Math.floor(Number(columns)||80)-1);rows=Math.max(1,Math.floor(Number(rows)||24));
 const entries=screen.rows??[],hint=screen.hint??navigationHint('menu'),full=wordmarkRows({columns:columns+1,rows})===8;
 const version=screen.version?'ver '+escapeTerminalText(screen.version):'',tagline=' ✦ agent role coordination';
 const fullTag=tagline+(version?'   '+version:''),tag=version&&!fit(fullTag,columns).complete?' ✦ '+version:fullTag;
 const frame=screen.frame??0,f=frame%36,sparkleFrame=f>=18?0:f,spinner='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[frame%10];
 const heading=screen.wordmark?[...(full?[...wordmark,tag]:['ARC ✦'+(version?' '+version:'')]),'─'.repeat(Math.min(columns,PANEL))]:[(screen.mode==='busy'?spinner+' ':'')+escapeTerminalText(screen.title)],position=screen.position?[escapeTerminalText(screen.position)]:[];
 const footer=screen.compactFooter?[]:screen.mode==='busy'||screen.hint==='Session ended'?[escapeTerminalText(hint)]:[...(screen.mode==='text'||screen.mode==='page'?[]:['']),'─'.repeat(columns),escapeTerminalText(hint)];
 const showSelection=screen.showSelection!==false,lines=[...heading,...entries.map((row,index)=>(index===screen.selected&&showSelection?'> ':'  ')+escapeTerminalText(row)),...position,...footer];
 const fitted=lines.map(line=>fit(line,columns)),bodySize=Math.max(0,rows-footer.length),bodyEnd=Math.min(lines.length-footer.length,bodySize);
 const indices=[...Array.from({length:bodyEnd},(_,index)=>index),...(footer.length?Array.from({length:Math.min(rows,footer.length)},(_,index)=>lines.length-Math.min(rows,footer.length)+index):[])],visible=indices.map(index=>fitted[index].text),styles=[];
 const selectedLine=heading.length+screen.selected;
 for(let line=0;line<visible.length;line++){
  const source=indices[line],runs=[];
  function add(from,to,role,fg,bg,bold){
   to=Math.min(to,[...visible[line]].length);if(from>=to)return;
   const run={from,to,role,...(fg?{fg}:{}),...(bg?{bg}:{}),...(bold?{bold}: {})},last=runs.at(-1);
   if(last&&last.to===from&&last.role===role&&JSON.stringify(last.fg)===JSON.stringify(fg)&&JSON.stringify(last.bg)===JSON.stringify(bg)&&last.bold===run.bold)last.to=to;else runs.push(run);
  }
  const length=[...visible[line]].length;
  if(screen.wordmark&&full&&source<6){for(const [col,character] of [...visible[line]].entries()){if(character===' ')continue;const color=gradientAt((col+0.75*source)/26.75);const intensity=shimmerIntensity(col,source,frame);add(col,col+1,character==='█'?'logo':'shadow',character==='█'?mix(color,[240,255,248],0.7*intensity):mix(color.map(value=>Math.round(value*0.55)),[150,230,200],0.5*intensity));}}
  else if(screen.wordmark&&source===(full?6:0)){
   if(!full)for(let col=0;col<3;col++)add(col,col+1,'logo',mix(gradientAt(col/2),[240,255,248],0.7*shimmerIntensity(col,0,frame)));
   const text=lines[source],sparkle=[...text].indexOf('✦'),versionAt=text.indexOf('ver '),tagAt=text.indexOf('agent role coordination');
   if(sparkle>=0)add(sparkle,sparkle+1,'sparkle',mix([110,231,183],[240,255,248],0.25*(1+Math.sin(2*Math.PI*sparkleFrame/36))));
   if(tagAt>=0)add(tagAt,tagAt+'agent role coordination'.length,'tagline',[134,176,158]);
   if(versionAt>=0)add(versionAt,length,'version',[52,211,153]);
  }
  else if(screen.wordmark&&source===heading.length-1){for(let i=0;i<length;i++){let color=gradientAt(i/(length-1||1));if(i>=0.75*length)color=mix(color,[24,52,42],(i-0.75*length)/(0.25*length));add(i,i+1,'rule',color);}}
  else if(!screen.wordmark&&source===0){if(screen.mode==='busy')add(0,1,'spinner',[52,211,153]);add(screen.mode==='busy'?2:0,length,'title',[110,231,183],undefined,true);}
  else if(source===selectedLine&&showSelection&&Number.isInteger(screen.selected)&&screen.selected>=0&&screen.selected<entries.length&&source<bodyEnd){
   const used=[...visible[line]].reduce((sum,character)=>sum+cellWidth(character),0),padding=Math.max(0,Math.min(columns,PANEL)-used);visible[line]+=' '.repeat(padding);
   add(0,length,'selected',[236,253,245],[6,95,70],true);add(length,length+padding,'selectedPad',undefined,[9,70,53]);
  }
  else if(source>=heading.length&&source<heading.length+entries.length&&screen.rowTones?.[source-heading.length]){
   const tone=screen.rowTones[source-heading.length],text=visible[line].slice(2);
   if(tone==='status'){let start=2;for(const segment of text.split(' / ')){const match=/^(.+?): (.+)$/.exec(segment);if(match){const role=Object.hasOwn(STATUS_TONES,match[2])?STATUS_TONES[match[2]]:'warn',from=start+[...match[1]].length+2;add(from,start+[...segment].length,role,TONE_FG[role]);}start+=[...segment].length+3;}}
   else if(tone==='diagnostic'){const separator=text.indexOf(': ');if(separator>=0)add(2+[...text.slice(0,separator+2)].length,length,'warn',TONE_FG.warn);}
   else if(tone==='diagnostic-cont')add(2,length,'warn',TONE_FG.warn);
  }
  else if(position.length&&source===heading.length+entries.length)add(0,length,'position',[110,130,120]);
  else if(footer.length&&source===lines.length-1){let start=0;for(const segment of visible[line].split(/( · )/)){const end=start+[...segment].length;add(start,end,segment===' · '?'hintSep':'hint',segment===' · '?[70,95,85]:[150,170,160]);start=end;}}
  else if(footer.length>1&&source===lines.length-2)add(0,length,'rule',[36,140,106]);
  if(runs.length)styles.push({line,runs});
 }
 const selectionEnabled=Number.isInteger(screen.selected)&&screen.selected>=0&&screen.selected<entries.length&&selectedLine<rows-footer.length-position.length&&fitted[selectedLine].complete;
 return{text:visible.join('\n'),selectionEnabled,styles};
}
