import {TargetConfigurationError} from '../../installer/targets.mjs';
import {revisionTag} from '../../runtime/role-dispatch-policy.mjs';
export {renderCodex as render} from '../../models/profiles.mjs';
export {readCodexConcurrency as readConcurrency, renderCodexConcurrency as renderConcurrency} from '../../installer/runtime-config.mjs';

const fail=message=>{throw new TargetConfigurationError(message);};
export function isOwnedStandalone(bytes,role){
 const platform='codex';
 if(!/^arc_(scouter|planner|implementer|qa|reviewer)$/.test(role))return false;
 const text=bytes.toString('utf8'),suffix=role.slice(4);
 if(!/^\[ARC role policy: contract begin\]\r?$/m.test(text))return false;
 if(platform==='claude'){
  const front=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);if(!front)return false;
  const names=front[1].match(/^name: .*\r?$/gm)??[];return names.length===1&&new RegExp(`^name: arc-${suffix}\\r?$`).test(names[0]);
 }
 if(platform!=='codex')return false;
 const names=text.match(/^name[ \t]*=.*\r?$/gm)??[];
 return names.length===1&&new RegExp(`^name[ \\t]*=[ \\t]*"arc_${suffix}"[ \\t]*(#.*)?\\r?$`).test(names[0]);
}
export function renameForRouting(bytes,role,revision){
 const platform='codex';
 if(typeof revision!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(revision))fail('Composite revision cannot be tagged');
 const suffix=role.slice(4),old=platform==='codex'?`arc_${suffix}`:`arc-${suffix}`,next=platform==='codex'?`arc_routing_${suffix}`:`arc-routing-${suffix}`;
 const text=bytes.toString('utf8'),pattern=platform==='codex'?new RegExp(`^name[ \\t]*=[ \\t]*["']${old}["']([ \\t]*(?:#[^\\r\\n]*)?)(\\r?)$`,'m'):new RegExp(`^name: ${old}(\\r?)$`,'m');
 const matches=[...text.matchAll(new RegExp(pattern.source,'gm'))];if(matches.length!==1)fail('Cannot identify the managed composite profile name');
 const renamed=platform==='codex'?text.replace(pattern,(_match,comment,cr)=>`name = "${next}"${comment}${cr}`):text.replace(pattern,(_match,cr)=>`name: ${next}${cr}`);
 return Buffer.from(tagDescription(renamed,platform,revision));
}

/** Only the header (before developer_instructions or the closing frontmatter fence) is searched, so instruction text cannot be mistaken for a description. */
function tagDescription(text,platform,revision){
 const tag=revisionTag(revision),lines=text.split('\n'),codex=platform==='codex',end=lines.findIndex((line,index)=>codex?/^developer_instructions[ \t]*=/.test(line):index>0&&line.replace(/\r$/,'')==='---'),limit=end<0?lines.length:end;
 const pattern=codex?/^(description[ \t]*=[ \t]*"(?:[^"\\]|\\.)*)("[ \t]*(?:#[^\r\n]*)?\r?)$/:/^(description: .*?)(\r?)$/,hits=[];
 for(let i=0;i<limit;i++)if(/^description[ \t]*[=:]/.test(lines[i]))hits.push(i);
 const match=hits.length===1?pattern.exec(lines[hits[0]]):null;if(!match)fail('Composite revision cannot be tagged');
 lines[hits[0]]=`${match[1]} ${tag}${match[2]}`;
 return lines.join('\n');
}

