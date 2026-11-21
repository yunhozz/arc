import {isAbsolute, relative} from 'node:path';

const entities = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  '\t': '&#9;', '\n': '&#10;', '\r': '&#13;'
};

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD')
    .replace(/[&<>"'\t\n\r]/g, char => entities[char]);
}

function attribute(name, value) {
  return ' ' + name + '="' + escapeAttribute(value) + '"';
}

function failureMessage(error) {
  return error?.cause?.message ?? error?.message ?? '';
}

function isFileFailure({file, name, nesting}, failed, children) {
  return failed && nesting === 0 && !children.length && isAbsolute(file ?? '') &&
    (name === file || name === relative(process.cwd(), file));
}

function writeTestcase({name, file, details, skip, todo}, failed) {
  const attrs = attribute('name', name) + attribute('file', file) + attribute('time', details.duration_ms / 1000);
  if (todo) return '<testcase' + attrs + '><skipped message="todo"/></testcase>\n';
  if (skip) return '<testcase' + attrs + '><skipped/></testcase>\n';
  if (failed) {
    return '<testcase' + attrs + '><failure' + attribute('message', failureMessage(details.error)) + '/></testcase>\n';
  }
  return '<testcase' + attrs + '/>\n';
}

function* writeResult({data, failed, children}) {
  const {name, file, details} = data;
  if (isFileFailure(data, failed, children)) {
    yield '<testsuite' + attribute('name', name) + attribute('file', file) + ' errors="1">' +
      '<error' + attribute('message', failureMessage(details?.error)) + '/></testsuite>\n';
    return;
  }

  const isSuite = details?.type === 'suite';
  if (children.length || isSuite) {
    const ownFailure = failed && details?.error?.failureType !== 'subtestsFailed';
    if (ownFailure && !isSuite) yield writeTestcase(data, true);
    yield '<testsuite' + attribute('name', name) + '>\n';
    if (ownFailure && isSuite) {
      yield '<error' + attribute('message', failureMessage(details?.error)) + '/>\n';
    }
    for (const child of children) yield* writeResult(child);
    yield '</testsuite>\n';
    return;
  }

  yield writeTestcase(data, failed);
}

export default async function* arcNodeReporter(source) {
  yield '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n';
  const files = new Map();
  for await (const {type, data} of source) {
    if (type === 'test:start') {
      if (!files.has(data.file)) files.set(data.file, []);
      files.get(data.file)[data.nesting] = {name: data.name, children: []};
    } else if (type === 'test:pass' || type === 'test:fail') {
      const stack = files.get(data.file);
      const started = stack?.[data.nesting];
      const children = started?.name === data.name ? started.children : [];
      if (started) stack.length = data.nesting;
      const result = {data, failed: type === 'test:fail', children};
      const parent = stack?.[data.nesting - 1];
      if (parent) parent.children.push(result);
      else yield* writeResult(result);
      if (stack?.length === 0) files.delete(data.file);
    }
  }
  yield '</testsuites>\n';
}
