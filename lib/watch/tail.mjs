import fsp from 'node:fs/promises';
import {createLineParser} from '../runtime/role-observe.mjs';
import {WATCH_LIMITS} from './model.mjs';

const parserFor = onLine => createLineParser(onLine, {maxLineBytes:WATCH_LIMITS.maxLineBytes});

export function createTail(file, {offset = 0} = {}) {
  let position = offset, lines = [], parser = parserFor(line => lines.push(line));
  return {
    get offset() { return position; },
    async poll() {
      lines = [];
      let handle, reset = false;
      try {
        handle = await fsp.open(file, 'r');
        const {size} = await handle.stat();
        if (size < position) {
          position = 0; reset = true;
          parser = parserFor(line => lines.push(line));
        }
        const buffer = Buffer.alloc(Math.min(WATCH_LIMITS.maxReadBytesPerTick, size - position));
        const {bytesRead} = buffer.length ? await handle.read(buffer, 0, buffer.length, position) : {bytesRead:0};
        position += bytesRead;
        parser.push(buffer.subarray(0, bytesRead));
        return {lines, reset, gone:false, overflowed:parser.overflow};
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return {lines, reset, gone:true, overflowed:false};
      } finally { await handle?.close(); }
    },
  };
}

export async function readTail(file, {maxBytes = WATCH_LIMITS.historyBytes} = {}) {
  const handle = await fsp.open(file, 'r');
  try {
    const {size} = await handle.stat(), start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    const {bytesRead} = await handle.read(buffer, 0, buffer.length, start);
    let chunk = buffer.subarray(0, bytesRead), parseStart = start;
    if (start > 0) {
      const newline = chunk.indexOf(10);
      if (newline < 0) return {lines:[], endOffset:start};
      parseStart += newline + 1;
      chunk = chunk.subarray(newline + 1);
    }
    // Leave incomplete bytes for createTail, whose parser survives live polls.
    const consumed = chunk.lastIndexOf(10) + 1;
    const lines = [], parser = parserFor(line => lines.push(line));
    parser.push(chunk.subarray(0, consumed));
    return {lines, endOffset:parseStart + consumed};
  } finally { await handle.close(); }
}

export async function readHead(file, {maxBytes, accept}) {
  let handle;
  try {
    handle = await fsp.open(file, 'r');
    const {size} = await handle.stat();
    let found = null, position = 0;
    const parser = parserFor(line => { if (found === null && accept(line)) found = line; });
    while (position < Math.min(size, maxBytes) && found === null) {
      const buffer = Buffer.alloc(Math.min(65536, size - position, maxBytes - position));
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      position += bytesRead;
      parser.push(buffer.subarray(0, bytesRead));
    }
    if (position === size) parser.end();
    return found;
  } catch (error) {
    if (!['ENOENT','EACCES'].includes(error.code)) throw error;
    return null;
  } finally { await handle?.close(); }
}
