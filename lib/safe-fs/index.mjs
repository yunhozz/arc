import fs from 'node:fs';
import { loadNative } from './native.mjs';
const state = new WeakMap();
const finalizer = new FinalizationRegistry(fd => { try { fs.closeSync(fd); } catch {} });
function value(handle) {
  const v = state.get(handle);
  if (!v || v.fd === null) throw new Error('Filesystem handle is closed');
  return v;
}
function register(handle, fd, native) {
  state.set(handle, { fd, native }); finalizer.register(handle, fd, handle);
}
class Handle {
  stat() { return fs.fstatSync(value(this).fd, { bigint: true }); }
  chmod(mode) { fs.fchmodSync(value(this).fd, mode); }
  setTimes(times, legacyMtime) {
    const v = value(this);
    if (times !== null && typeof times === 'object' && !(times instanceof Date)) {
      if (typeof times.atimeNs !== 'bigint' || typeof times.mtimeNs !== 'bigint') throw new TypeError('Timestamp metadata requires BigInt nanoseconds');
      v.native.setTimes(v.fd, times.atimeNs, times.mtimeNs);
    } else fs.futimesSync(v.fd, times, legacyMtime);
  }
  sync() { fs.fsyncSync(value(this).fd); }
  close() { const v = value(this); fs.closeSync(v.fd); v.fd = null; finalizer.unregister(this); }
}
export class FileHandle extends Handle {
  readAll() { return this.read(); }
  writeAll(buffer) { return this.write(buffer); }
  read() {
    const descriptor = value(this).fd;
    const parts = []; let position = 0;
    for (;;) {
      const chunk = Buffer.alloc(65536);
      const count = fs.readSync(descriptor, chunk, 0, chunk.length, position);
      if (!count) return Buffer.concat(parts);
      parts.push(chunk.subarray(0, count)); position += count;
    }
  }
  write(data, position = 0) {
    const fd = value(this).fd; const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data); let offset = 0;
    while (offset < bytes.length) { const count = fs.writeSync(fd, bytes, offset, bytes.length - offset, position + offset); if (!count) throw new Error('Short file write'); offset += count; }
    return offset;
  }
}
export class DirectoryHandle extends Handle {
  openDir(name) { const v = value(this); const h = new DirectoryHandle(); register(h, v.native.openAt(v.fd, name, 1, 0, 0, 0, 0), v.native); return h; }
  openFile(name, { read = true, create = false, exclusive = false, createExclusive = false, mode = 0o600 } = {}) {
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) throw new TypeError('Invalid file mode');
    const v = value(this), h = new FileHandle();
    register(h, v.native.openAt(v.fd, name, 0, Number(create || createExclusive), Number(exclusive || createExclusive), mode, Number(!read || create || createExclusive)), v.native);
    return h;
  }
  readDir() { const v = value(this); return v.native.readDir(v.fd).sort(); }
  lstat(name) { const v = value(this); return v.native.lstat(v.fd, name); }
  symlink(target, name) { const v = value(this); v.native.symlink(v.fd, name, target); }
  readlink(name) { const v = value(this); return v.native.readlink(v.fd, name); }
  mkdir(name, mode = 0o700) { if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) throw new TypeError('Invalid directory mode'); const v = value(this); v.native.mkdir(v.fd, name, mode); }
  unlink(name) { const v = value(this); v.native.unlink(v.fd, name); }
  rmdir(name) { const v = value(this); v.native.rmdir(v.fd, name); }
  renameTo(name, destination, newName) { const v = value(this), target = value(destination); if (!(destination instanceof DirectoryHandle)) throw new TypeError('Destination must be a directory handle'); v.native.rename(v.fd, name, target.fd, newName); }
}
let defaultNative;
export function openRoot(path, { native } = {}) {
  const binding = native ?? (defaultNative ??= loadNative());
  const handle = new DirectoryHandle(); register(handle, binding.openRoot(path), binding); return handle;
}
