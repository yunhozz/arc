const graphemes = new Intl.Segmenter(undefined, {granularity:'grapheme'});
const zeroWidth = /^[\u0300-\u036f\u200b-\u200f\ufe00-\ufe0f]+$/u;
const wide = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1f64f}\u{1f900}-\u{1f9ff}\u{20000}-\u{3fffd}]/u;
function graphemeWidth(text) {
  if (zeroWidth.test(text)) return 0;
  if (wide.test(text) || /\p{Emoji_Presentation}/u.test(text) || (/[\u200d\ufe0f]/u.test(text) && /\p{Extended_Pictographic}/u.test(text))) return 2;
  return 1;
}

export function displayWidth(text) {
  let width = 0;
  for (const {segment} of graphemes.segment(text)) width += graphemeWidth(segment);
  return width;
}

// Return UTF-16 offsets so styled callers can wrap before adding SGR codes.
export function wrapLineRanges(text, avail, {preserveWhitespace = false} = {}) {
  const parts = Array.from(graphemes.segment(text), ({segment, index}) => ({segment, index, width:graphemeWidth(segment)}));
  const lines = [];
  let start = 0;
  while (start < parts.length) {
    let end = start, cols = 0, space = -1, hasContent = false;
    while (end < parts.length && cols + parts[end].width <= avail) {
      if (parts[end].segment === ' ') { if (hasContent) space = end; }
      else hasContent = true;
      cols += parts[end++].width;
    }
    if (!preserveWhitespace && parts[end]?.segment === ' ' && hasContent) space = end;
    const useSpace = !preserveWhitespace && end < parts.length && space >= 0;
    const overflows = end === start;
    const pieceEnd = useSpace ? space : Math.max(start + 1, end);
    const from = parts[start].index;
    const to = parts[pieceEnd]?.index ?? text.length;
    if (preserveWhitespace || text.slice(from, to).trim()) lines.push({from, to, overflows});
    start = useSpace ? space + 1 : pieceEnd;
  }
  return lines.length ? lines : [{from:0, to:0}];
}

export function wrapLine(text, avail) {
  if (avail <= 0) return [text];
  return wrapLineRanges(text, avail).map(({from, to}) => text.slice(from, to));
}
