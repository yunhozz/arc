import path from 'node:path';
import {gradientAt, toAnsi256} from '../color/palette.mjs';
import {displayWidth} from './render.mjs';
import {sanitizeText} from './policy.mjs';

const graphemes = new Intl.Segmenter(undefined, {granularity:'grapheme'});
const PERIOD = 18, SWEEP = 13, R = 2.5;

function watchShimmerIntensity(index, tick) {
  const f = tick % PERIOD;
  if (f >= SWEEP) return 0;
  const c = -R + f;
  return Math.max(0, 1 - Math.abs(index - c) / R) ** 2;
}

export function watchLocationLabel({dir, home}) {
  let label = dir;
  if (dir === home) label = '~';
  else if (home && dir.startsWith(home + path.sep)) label = '~' + dir.slice(home.length);
  return sanitizeText(label);
}

export function shimmerText(text, tick) {
  const characters = [...text];
  return characters.map((character, i) => {
    const base = gradientAt(i / Math.max(1, characters.length - 1));
    const intensity = watchShimmerIntensity(i, tick);
    const rgb = base.map(value => Math.round(value + (255 - value) * intensity));
    return `\x1b[38;5;${toAnsi256(rgb)}m${character}`;
  }).join('') + '\x1b[0m';
}

function clipLine(text, columns) {
  let result = '', used = 0, styled = false;
  for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith('\x1b[')) {
      result += part;
      styled = true;
      continue;
    }
    for (const {segment} of graphemes.segment(part)) {
      const size = displayWidth(segment);
      if (used + size > columns) return result + (styled ? '\x1b[0m' : '');
      result += segment;
      used += size;
    }
  }
  return result;
}

export function statusBlockLines({label, busy, glyph, tick, color, fancy, width}) {
  const lines = [color ? `\x1b[2m${label}\x1b[0m` : label];
  if (busy) lines.push(color && fancy
    ? `\x1b[2m${glyph}\x1b[0m ${shimmerText('working…', tick)}`
    : `${glyph} working…`);
  return lines.map(line => clipLine(line, Math.max(0, width - 1)));
}
