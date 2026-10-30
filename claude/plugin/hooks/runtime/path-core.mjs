// Portable path operations for normalized, host-observed absolute paths.
function parse(value,windows){
 if(typeof value!=='string'||value.includes('\0'))return null;
 if(!windows)return value.startsWith('/')?{root:'/',rest:value.slice(1)}:null;
 const converted=value.replaceAll('/','\\');
 const drive=/^([A-Za-z]:)\\/.exec(converted);
 if(drive)return {root:drive[1]+'\\',rest:converted.slice(3)};
 const unc=/^\\\\([^\\]+)\\([^\\]+)(?:\\|$)/.exec(converted);
 if(unc&&!['?','.'].includes(unc[1]))return {root:'\\\\'+unc[1]+'\\'+unc[2]+'\\',rest:converted.slice(unc[0].length)};
 return converted.startsWith('\\')?{root:'\\',rest:converted.slice(1)}:null;
}
function makePath(windows){
 const sep=windows?'\\':'/';
 const isAbsolute=value=>!!parse(value,windows);
 const normalize=value=>{
  const parsed=parse(value,windows);if(!parsed)return value;
  const parts=[];for(const part of parsed.rest.split(sep)){
   if(!part||part==='.')continue;
   if(part==='..'){parts.pop();continue;}
   parts.push(part);
  }
  const trailing=parsed.rest.endsWith(sep)&&parts.length>0?sep:'';
  return parsed.root+parts.join(sep)+trailing;
 };
 const join=(base,...parts)=>{
  if(!parse(base,windows)||parts.some(part=>typeof part!=='string'||part.includes('\0')))throw Error('Invalid absolute path');
  return normalize([base,...parts].join(sep));
 };
 const relative=(from,to)=>{
  const a=parse(normalize(from),windows),b=parse(normalize(to),windows);
  if(!a||!b)return to;
  const compare=value=>windows?value.toLowerCase():value;
  if(compare(a.root)!==compare(b.root))return normalize(to);
  const left=a.rest.split(sep).filter(Boolean),right=b.rest.split(sep).filter(Boolean);
  let i=0;while(i<left.length&&i<right.length&&compare(left[i])===compare(right[i]))i++;
  return [...left.slice(i).map(()=>'..'),...right.slice(i)].join(sep);
 };
 return {sep,isAbsolute,normalize,join,relative};
}
const posix=makePath(false),win32=makePath(true);
export function forTarget(target){
 if(typeof target!=='string')throw Error('Absolute target required');
 if(/^(?:[A-Za-z]:[\\/]|\\\\)/.test(target))return win32;
 if(target.startsWith('/'))return posix;
 throw Error('Absolute target required');
}
