const STOPS=[[178,245,214],[110,231,183],[52,211,153],[16,185,129]];
const mix=(from,to,t)=>from.map((value,index)=>Math.round(value+(to[index]-value)*t));
export function gradientAt(t){const position=Math.max(0,Math.min(1,Number(t)||0))*3,segment=Math.min(2,Math.floor(position));return mix(STOPS[segment],STOPS[segment+1],position-segment);}
export function shimmerIntensity(column,row,frame){const f=frame%36;if(f>=18)return 0;const c=-4+f*33.5/17,p=column+0.5*row;return Math.max(0,1-Math.abs(p-c)/3)**2;}
const rgb=color=>[0,1,2].map(index=>Math.max(0,Math.min(255,Math.round(Number(color[index])||0))));
export function toAnsi256(color){const [r,g,b]=rgb(color);return 16+36*Math.round(r/51)+6*Math.round(g/51)+Math.round(b/51);}
