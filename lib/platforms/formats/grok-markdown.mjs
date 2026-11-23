import {TargetConfigurationError} from '../../installer/target-errors.mjs';
import {getPlatform} from '../../runtime/platform-registry.mjs';
import {revisionTag} from '../../runtime/role-dispatch-policy.mjs';

const fail = message => {throw new TargetConfigurationError(message);};
const validRole = role => /^arc_(scouter|planner|implementer|tester|reviewer)$/.test(role);
const nonStringScalar = /^(?:~|null|true|false|yes|no|on|off|[-+]?(?:\.inf|\.nan|0[xob][0-9a-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:e[-+]?\d+)?)|\d{4}-\d{2}-\d{2}(?:[Tt ].*)?)$/i;
// Inline brackets remain valid text for the ARC routing revision tag.
const validScalar = value => value === value.trim() && !/[\p{Cc}\u2028\u2029{}#&*!|>"']/u.test(value)
  && !/^(?:[-?:](?:\s|$)|[\[\],%@`])/.test(value) && !value.includes(': ') && !nonStringScalar.test(value);

// ARC-defined narrow scalar-only frontmatter; not live-verified with Grok.
// nativeProfile remains off (spec section 6 / U-K10).
function parse(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(text);
  if (!match || !match[2].trim()) fail('Invalid Grok profile frontmatter or instructions');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([a-z][a-zA-Z0-9_-]*): (.+)$/.exec(line);
    if (!entry || Object.hasOwn(fields, entry[1]) || !validScalar(entry[2])) fail('Malformed or duplicate Grok frontmatter');
    fields[entry[1]] = entry[2];
  }
  if (Object.keys(fields).length !== 3 || !['name', 'description', 'model'].every(key => fields[key])) fail('Invalid Grok profile fields');
  if (!getPlatform('grok').routing.validatePair(fields.model, 'default')) fail('Invalid Grok profile model');
  return {fields, header: match[1]};
}

export function render(text, role, settings) {
  const {fields, header} = parse(text);
  if (!validRole(role) || fields.name !== role.replace('_', '-') || !getPlatform('grok').routing.validatePair(settings.model, settings.effort)) fail('Invalid Grok profile identity or settings');
  const rendered = header.replace(/^model: .+$/m, line => `model: ${settings.model}${line.endsWith('\r') ? '\r' : ''}`);
  return Buffer.from(text.replace(header, () => rendered));
}

export function isOwnedStandalone(bytes, role, {legacy = false} = {}) {
  try {
    const text = bytes.toString('utf8'), {fields} = parse(text);
    return (validRole(role) || legacy && role === 'arc_qa') && fields.name === role.replace('_', '-') && /^\[ARC role policy: contract begin\]\r?$/m.test(text);
  } catch {return false;}
}

export function renameForRouting(bytes, role, revision) {
  if (typeof revision !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(revision)) fail('Composite revision cannot be tagged');
  const text = bytes.toString('utf8'), {fields, header} = parse(text);
  if (!validRole(role) || fields.name !== role.replace('_', '-')) fail('Cannot identify the managed composite profile name');
  const renamed = header.replace(/^name: .+(\r?)$/m, () => `name: arc-routing-${role.slice(4)}${header.split('\n')[0].endsWith('\r') ? '\r' : ''}`)
    .replace(/^(description: .*?)(\r?)$/m, (_line, description, cr) => `${description} ${revisionTag(revision)}${cr}`);
  return Buffer.from(text.replace(header, () => renamed));
}
