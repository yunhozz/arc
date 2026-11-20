import {displayWidth, wrapLineRanges} from './text-width.mjs';

const reset = '\x1b[0m';
const inline = /(?<!`)`(?<code>[^`]+)`(?!`)|\[(?<label>[^\[\]]+)\]\((?<url>[^\s()]+)\)|(?<![\p{L}\p{N}_*])(?<delimiter>\*\*?)(?![\s*])(?<emphasis>[^*]*?)(?<!\s)\k<delimiter>(?!\*)/gu;
const fenceMarker = /^ *(`{3,}|~{3,})(.*)$/;

function inlineSpans(text) {
  const spans = [];
  let start = 0;
  for (const {index, 0:token, groups:{code, label, url, delimiter, emphasis}} of text.matchAll(inline)) {
    if (index > start) spans.push({text:text.slice(start, index)});
    if (code !== undefined) spans.push({text:code, style:'38;5;180'});
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
    if (line) line = `\x1b[${active}m${line}`;
    if (overflows) return `${line || `\x1b[${active}m`}�${reset}`;
    while (from < to && spanIndex < spans.length) {
      const span = spans[spanIndex];
      const spanEnd = spanStart + span.text.length;
      if (spanEnd > from) {
        const code = span.style ? `${blockCode};${span.style}` : blockCode;
        if (!line) line = `\x1b[${code}m`;
        else if (active !== code) line += `\x1b[0;${code}m`;
        line += span.text.slice(Math.max(from - spanStart, 0), to - spanStart);
        active = code;
      }
      if (spanEnd >= to) break;
      spanStart = spanEnd;
      spanIndex++;
    }
    return line ? `${line}${reset}` : '';
  });
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
  const cells = [header, ...rows].map(row => row.map(inlineSpans));
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
    let preserveWhitespace = Boolean(fence) || line.startsWith('|');
    if (fence) {
      prefix = '  ';
      blockStyle = '2';
    } else if (!preserveWhitespace) {
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
      } else if (splitTableRow(line)) {
        preserveWhitespace = true;
      }
    }
    const spans = preserveWhitespace ? [{text:content}] : inlineSpans(content);
    for (const visual of renderLine(spans, {width, baseCode, prefix, blockStyle, preserveWhitespace})) lines.push(visual);
  }
  return lines;
}
