import {renderBox} from './markdown.mjs';
import {sanitizeText} from './policy.mjs';
import {displayWidth, wrapLineRanges} from './text-width.mjs';

function wrapPlain(text, width) {
  return wrapLineRanges(text, width).map(({from,to,overflows}) => overflows ? '�' : text.slice(from,to));
}

export function briefLines(brief, {version, keys}) {
  const scope = sanitizeText(brief.scope + (brief.branch ? ` (${brief.branch})` : ''));
  return [
    `arc watch ${version}`,
    `**Scope** ${scope.replace(/[\\*`\[]/g, '\\$&')}`,
    `**Platforms** ${brief.platforms.map(platform => platform.toUpperCase()).join(' · ')}`,
    `**Keys** ${keys.join(' · ')}`,
  ];
}

export function renderBrief(brief, {version, keys, width, color}) {
  const columns = width - 1;
  if (columns < 1) return [];
  const lines = briefLines(brief, {version, keys});
  if (width >= 24) return renderBox(lines, {width:columns, baseCode:color ? '2' : undefined});
  return lines.flatMap(markdown => {
    const label = /^\*\*([^*]+)\*\* /.exec(markdown);
    const value = markdown.slice(label?.[0].length ?? 0).replace(/\\([\\*`\[])/g, '$1');
    if (!label) return wrapPlain(value, columns);

    const prefix = `${label[1]} `;
    const available = columns - displayWidth(prefix);
    if (available < 1 || !value) return wrapPlain(prefix + value, columns);
    const [first] = wrapLineRanges(value, available);
    if (first.overflows) return wrapPlain(prefix + value, columns);

    const rest = value.slice(first.to).trimStart();
    return [prefix + value.slice(first.from, first.to), ...(rest ? wrapPlain(rest, columns) : [])];
  });
}
