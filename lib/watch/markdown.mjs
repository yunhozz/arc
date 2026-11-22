import {displayWidth, wrapLineRanges} from './text-width.mjs';

const reset = '\x1b[0m';
const inline = /(?<!`)`(?<code>[^`]+)`(?!`)|\[(?<label>[^\[\]]+)\]\((?<url>[^\s()]+)\)|(?<delimiter>(?<!\*)\*\*|(?<![\p{L}\p{N}_*])\*)(?![\s*])(?<emphasis>[^*]*?)(?<!\s)\k<delimiter>(?!\*)/gu;
const boxInline = new RegExp(/\\(?<escaped>[\\*`\[])/.source + '|' + inline.source, inline.flags);
const fenceMarker = /^ *(`{3,}|~{3,})(.*)$/;
const pipeStart = /^ *\|/;

function inlineSpans(text, pattern = inline) {
  const spans = [];
  let start = 0;
  for (const {index, 0:token, groups:{code, label, url, delimiter, emphasis, escaped}} of text.matchAll(pattern)) {
    if (index > start) spans.push({text:text.slice(start, index)});
    if (escaped !== undefined) spans.push({text:escaped});
    else if (code !== undefined) spans.push({text:code, style:'38;5;180'});
    else if (label !== undefined) spans.push({text:`${label} (${url})`});
    else spans.push({text:emphasis, style:delimiter === '**' ? '1' : '3'});
    start = index + token.length;
  }
  if (start < text.length) spans.push({text:text.slice(start)});
  return spans;
}

function renderLine(spans, {width, baseCode, blockStyle, prefix = '', preserveWhitespace}) {
  const blockCode = blockStyle ? `${baseCode};${blockStyle}` : baseCode;
  // Very narrow widths may leave no room after a marker. Wrap it with the body in that case.
  if (prefix && width - prefix.length < 2) {
    spans.unshift({text:prefix});
    prefix = '';
  }
  const text = spans.map(span => span.text).join('');
  const avail = width - prefix.length;
  const ranges = avail === Infinity ? [{from:0, to:text.length}]
    : avail > 0 ? wrapLineRanges(text, avail, {preserveWhitespace}) : [{from:0, to:0}];
  let spanIndex = 0, spanStart = 0;
  return ranges.map(({from, to, overflows}, index) => {
    let line = index ? ' '.repeat(prefix.length) : prefix;
    let active = blockCode;
    if (line && baseCode) line = `\x1b[${active}m${line}`;
    if (overflows) return baseCode ? `${line || `\x1b[${active}m`}�${reset}` : `${line}�`;
    while (from < to && spanIndex < spans.length) {
      const span = spans[spanIndex];
      const spanEnd = spanStart + span.text.length;
      if (spanEnd > from) {
        const code = span.style ? `${blockCode};${span.style}` : blockCode;
        if (baseCode) {
          if (!line) line = `\x1b[${code}m`;
          else if (active !== code) line += `\x1b[0;${code}m`;
        }
        line += span.text.slice(Math.max(from - spanStart, 0), to - spanStart);
        active = code;
      }
      if (spanEnd >= to) break;
      spanStart = spanEnd;
      spanIndex++;
    }
    return line && baseCode ? `${line}${reset}` : line;
  });
}

export function renderBox(lines, {width, baseCode}) {
  if (width < 5) return [];
  const rows = lines.map(line => {
    const prefix = /^\*\*([^*]+)\*\* /.exec(line);
    return prefix
      ? {label:prefix[1], spans:inlineSpans(line.slice(prefix[0].length), boxInline)}
      : {label:'', spans:inlineSpans(line, boxInline)};
  });
  const labelWidth = Math.max(0, ...rows.map(row => displayWidth(row.label)));
  const natural = Math.max(1, ...rows.map(({label,spans}) =>
    (label ? labelWidth + 2 : 0) + displayWidth(spans.map(span => span.text).join(''))));
  const contentWidth = Math.min(natural, width - 4);
  const paint = (text, code) => code ? `\x1b[${code}m${text}${reset}` : text;
  const border = (left, right) => paint(left + '─'.repeat(contentWidth + 2) + right, baseCode);
  const body = rows.flatMap(({label,spans}) => {
    const alignLabel = label && contentWidth - labelWidth - 2 >= 2;
    const prefixWidth = alignLabel ? labelWidth + 2 : 0;
    const value = !alignLabel && label ? [{text:label,style:'1'},{text:' '},...spans] : spans;
    return renderLine(value, {width:contentWidth - prefixWidth, baseCode:baseCode && '0'}).map((line, index) => {
      const prefix = alignLabel && !index
        ? paint(label, baseCode && '1') + ' '.repeat(prefixWidth - displayWidth(label))
        : ' '.repeat(prefixWidth);
      const pad = contentWidth - prefixWidth - displayWidth(line.replace(/\x1b\[[0-9;]*m/g, ''));
      return `${paint('│',baseCode)} ${prefix}${line}${' '.repeat(pad + 1)}${paint('│',baseCode)}`;
    });
  });
  return [border('┌', '┐'), ...body, border('└', '┘')];
}

function splitTableRow(line) {
  if (!line?.includes('|')) return;
  const row = line.trim();
  const cells = [];
  let start = 0;
  const cell = end => row.slice(start, end).trim().replace(/\\\\|\\\|/g, token => token === '\\|' ? '|' : token);
  for (const {0:token, index} of row.matchAll(/\\[\\|]|(?<!`)`[^`]+`(?!`)|\|/g)) {
    if (token !== '|') continue;
    if (index) cells.push(cell(index));
    start = index + 1;
  }
  if (!start) return;
  if (start < row.length) cells.push(cell(row.length));
  return cells;
}

function readTable(source, index) {
  if (!pipeStart.test(source[index])) return;
  const divider = source[index + 1];
  if (!divider?.includes('|') || !/^[ |:-]+$/.test(divider)) return;
  const header = splitTableRow(source[index]);
  const columns = splitTableRow(divider);
  if (!header?.length || columns.length !== header.length || !columns.every(cell => /^:?-+:?$/.test(cell))) return;

  const rows = [];
  let end = index + 2;
  for (; end < source.length && !fenceMarker.test(source[end]); end++) {
    const cells = splitTableRow(source[end]);
    if (!cells) break;
    rows.push(header.map((_, col) => col === header.length - 1 ? cells.slice(col).join(' | ') : cells[col] ?? ''));
  }
  if (!rows.length) return;
  const alignments = columns.map(cell => !cell.endsWith(':') ? 'left' : cell.startsWith(':') ? 'center' : 'right');
  return {header, rows, alignments, end};
}

function fitTableWidths(natural, width) {
  const available = width - (3 * natural.length + 1);
  if (natural.reduce((sum, cols) => sum + cols, 0) <= available) return natural;
  if (6 * natural.length > available) return;

  // Cap the widest columns together, then use any remaining space among those columns.
  let low = 6, high = available;
  while (low < high) {
    const cap = Math.ceil((low + high) / 2);
    const total = natural.reduce((sum, cols) => sum + Math.min(cols, cap), 0);
    if (total <= available) low = cap;
    else high = cap - 1;
  }
  const widths = natural.map(cols => Math.min(cols, low));
  let remaining = available - widths.reduce((sum, cols) => sum + cols, 0);
  for (let col = widths.length - 1; col >= 0 && remaining > 0; col--) {
    if (natural[col] > low) {
      widths[col]++;
      remaining--;
    }
  }
  return widths;
}

function renderCards([header, ...rows], {width, baseCode}) {
  const lines = [];
  for (const row of rows) {
    if (lines.length) lines.push('');
    for (const [col, value] of row.entries()) {
      const marker = col === 0 ? '▸ ' : '  ';
      const label = `${header[col].map(span => span.text).join('')}:`;
      const prefix = `${marker}${label} `;
      const prefixWidth = displayWidth(prefix);
      if (width - prefixWidth < 2) {
        lines.push(...renderLine([{text:label}], {width, baseCode, prefix:marker}));
        if (value.length) lines.push(...renderLine(value, {width, baseCode, prefix:'  '}));
        continue;
      }
      const wrapped = renderLine(value, {width:width - prefixWidth, baseCode});
      for (const [index, piece] of wrapped.entries()) {
        const lead = index ? ' '.repeat(prefixWidth) : prefix;
        lines.push(piece ? `\x1b[${baseCode}m${lead}${piece}` : `\x1b[${baseCode}m${lead.trimEnd()}${reset}`);
      }
    }
  }
  return lines;
}

function renderTable({header, rows, alignments}, options) {
  const {baseCode, width} = options;
  const cells = [header, ...rows].map(row => row.map(cell => inlineSpans(cell)));
  const natural = header.map(() => 1);
  for (const row of cells) {
    for (const [col, spans] of row.entries()) {
      natural[col] = Math.max(natural[col], displayWidth(spans.map(span => span.text).join('')));
    }
  }
  const widths = fitTableWidths(natural, width);
  if (!widths) return renderCards(cells, options);

  const border = (left, cross, right) => `\x1b[${baseCode}m${left}${widths.map(cols => '─'.repeat(cols + 2)).join(cross)}${right}${reset}`;
  const lines = [border('┌', '┬', '┐')];
  for (const [index, row] of cells.entries()) {
    if (index) lines.push(border('├', '┼', '┤'));
    const wrapped = row.map((spans, col) => renderLine(spans, {width:widths[col], baseCode, blockStyle:index === 0 ? '1' : undefined}));
    const height = wrapped.reduce((max, cell) => Math.max(max, cell.length), 0);
    for (let line = 0; line < height; line++) {
      let visual = `\x1b[${baseCode}m│`;
      for (const [col, cell] of wrapped.entries()) {
        const piece = cell[line] ?? '';
        const pad = widths[col] - displayWidth(piece.replace(/\x1b\[[0-9;]*m/g, ''));
        const left = alignments[col] === 'right' ? pad : alignments[col] === 'center' ? Math.floor(pad / 2) : 0;
        visual += ' '.repeat(left + 1);
        if (piece) visual += `${piece}\x1b[${baseCode}m`;
        visual += `${' '.repeat(pad - left + 1)}│`;
      }
      lines.push(visual + reset);
    }
  }
  lines.push(border('└', '┴', '┘'));
  return lines;
}

export function renderMarkdown(text, {width, baseCode}) {
  const lines = [];
  const source = text.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, '').split('\n');
  let fence;
  for (let index = 0; index < source.length; index++) {
    const line = source[index];
    const marker = fenceMarker.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = undefined;
        continue;
      }
    } else if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      fence = marker[1];
      continue;
    }
    if (!line) {
      lines.push('');
      continue;
    }
    if (!fence) {
      const table = readTable(source, index);
      if (table) {
        for (const visual of renderTable(table, {width, baseCode})) lines.push(visual);
        index = table.end - 1;
        continue;
      }
    }

    let content = line, prefix, blockStyle;
    const rawPipe = pipeStart.test(line);
    if (fence) {
      prefix = '  ';
      blockStyle = '2';
    } else if (!rawPipe) {
      const heading = /^#{1,6} (.*)$/.exec(line);
      const list = /^( *)([-*+]|\d+\.) (.*)$/.exec(line);
      if (heading) {
        content = heading[1];
        blockStyle = '1;4';
      } else if (/^ *(?:---|\*\*\*|___) *$/.test(line)) {
        content = '─'.repeat(Math.max(0, Math.min(width, 40)));
      } else if (list) {
        const indent = ' '.repeat(list[1].length - list[1].length % 2);
        prefix = `${indent}${list[2].endsWith('.') ? list[2] : '•'} `;
        content = list[3];
      } else if (line.startsWith('> ')) {
        prefix = '│ ';
        blockStyle = '2';
        content = line.slice(2);
      }
    }
    const spans = fence || rawPipe ? [{text:content}] : inlineSpans(content);
    for (const visual of renderLine(spans, {width, baseCode, prefix, blockStyle, preserveWhitespace:Boolean(fence)})) lines.push(visual);
  }
  return lines;
}
