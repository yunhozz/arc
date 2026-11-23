import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {inspectPath, observeCooperativeTarget, within} from './scope.mjs';

export async function writeHandoffRecord({cwd, slug, content}) {
  if (typeof slug !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(slug) || slug.includes('..')) {
    return {decision: 'deny', reasonCode: 'invalid_slug', message: 'Invalid handoff record slug.'};
  }

  let gitCommonDir;
  let filename;
  let temporaryFile;
  try {
    if (typeof content !== 'string' || !content.length) throw Error('Expected nonempty handoff content.');
    ({gitCommonDir} = await observeCooperativeTarget(cwd));
    const directory = path.join(gitCommonDir, 'arc', 'handoff');
    filename = path.join(directory, `${slug}.md`);
    if (!within(gitCommonDir, filename)) {
      return {decision: 'deny', reasonCode: 'path_outside_common_dir', message: 'Handoff record path must stay inside the Git common directory.'};
    }

    await inspectPath(filename, {missing: true});
    await fs.mkdir(directory, {recursive: true, mode: 0o700});
    await inspectPath(filename, {missing: true});
    let created = false;
    try {
      await fs.lstat(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      created = true;
    }

    const candidate = path.join(directory, `.handoff-${randomUUID()}.tmp`);
    const file = await fs.open(candidate, 'wx', 0o600);
    temporaryFile = candidate;
    try {
      await file.writeFile(content, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temporaryFile, filename);
    temporaryFile = undefined;
    return {decision: 'allow', path: filename, created};
  } catch (error) {
    if (gitCommonDir && error.symlinkPath && within(gitCommonDir, error.symlinkPath)) {
      const destination = await fs.readlink(error.symlinkPath).catch(() => null);
      if (destination !== null && !within(gitCommonDir, path.resolve(path.dirname(error.symlinkPath), destination))) {
        return {decision: 'deny', reasonCode: 'path_outside_common_dir', message: `Handoff record path must stay inside the Git common directory: ${filename}`};
      }
    }
    const failedPath = error.symlinkPath ?? filename;
    return {decision: 'hold', reasonCode: 'handoff_write_failed', message: failedPath ? `${failedPath}: ${error.message}` : error.message, fallback: 'inline'};
  } finally {
    if (temporaryFile) await fs.rm(temporaryFile, {force: true}).catch(() => {});
  }
}
