import {posix} from 'node:path';

export const PARSER_SCHEMA_VERSION = 1;
export const REPORT_SCHEMA_VERSION = 1;

export function normalizeTestFile(raw, worktreeRealpath) {
  if (typeof raw !== 'string' || !raw || raw.includes('\0')) return '-';
  let value = raw;
  if (/^file:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = (url.hostname ? '//' + url.hostname : '') + decodeURIComponent(url.pathname);
    } catch {
      return '-';
    }
  }
  if (value.includes('\0')) return '-';

  const posixPath = value => posix.normalize(value.replaceAll('\\', '/').replace(/^\/(?=[a-z]:\/)/i, ''));
  let file = posixPath(value);
  if (posix.isAbsolute(file) || /^[a-z]:\//i.test(file)) {
    const root = posixPath(worktreeRealpath).replace(/\/?$/, '/');
    if (!file.startsWith(root)) return '-';
    file = file.slice(root.length);
  }
  return !file || file === '.' || file === '..' || file.startsWith('../') ? '-' : file;
}

export function assignTestIds(tests) {
  const ordinals = new Map();
  return tests.map(({file, suite, name, status, durationMs}) => {
    const key = JSON.stringify([file, suite, name]);
    const k = (ordinals.get(key) ?? 0) + 1;
    ordinals.set(key, k);
    return {testId: file + '::' + suite + '::' + name + '#' + k, file, suite, name, k, status, durationMs};
  });
}

function fileFromName(name, ctx) {
  if (typeof name !== 'string' || !/[\\/]|[^.]\.[^./\\]+$/.test(name)) return '-';
  const file = normalizeTestFile(name, ctx.worktree);
  return file !== '-' && ctx.fileExists(file) ? file : '-';
}

function duration(value, multiplier = 1) {
  if (value == null || !String(value).trim()) return null;
  const ms = Number(value) * multiplier;
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

const commandIssue = reason => ({scope: 'command', reason});
const fileIssue = path => ({scope: 'file', path, reason: 'file_error'});

const xmlEntities = Object.freeze({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"});
const invalidXmlChar = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;

function malformedXml() {
  throw new SyntaxError('Malformed JUnit XML');
}

function decodeXml(value) {
  if (invalidXmlChar.test(value)) malformedXml();
  return value.replace(/&(?:([^&<;\s]+);)?/g, (_, entity) => {
    if (Object.hasOwn(xmlEntities, entity)) return xmlEntities[entity];
    const numeric = /^#(?:(\d+)|x([\da-fA-F]+))$/.exec(entity ?? '');
    if (!numeric) malformedXml();
    const point = numeric[1] ? Number(numeric[1]) : Number.parseInt(numeric[2], 16);
    if (point > 0x10ffff) malformedXml();
    const decoded = String.fromCodePoint(point);
    if (invalidXmlChar.test(decoded)) malformedXml();
    return decoded;
  });
}

function xmlAttributes(text) {
  const attrs = Object.create(null);
  const attrPattern = /\s+([A-Za-z_:][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y;
  while (attrPattern.lastIndex < text.length) {
    const start = attrPattern.lastIndex;
    const attr = attrPattern.exec(text);
    if (!attr) {
      if (text.slice(start).trim()) malformedXml();
      break;
    }
    if (Object.hasOwn(attrs, attr[1])) malformedXml();
    attrs[attr[1]] = decodeXml((attr[2] ?? attr[3]).replace(/\r\n|[\t\r\n]/g, ' '));
  }
  return attrs;
}

export function parseJunitXml(text, ctx) {
  const tests = [];
  const incomplete = [];
  const stack = [];
  let rootSeen = false;
  let cursor = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const tagPattern = /<(\/?)([A-Za-z_:][\w.:-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*)>/y;

  function closeElement() {
    const node = stack.pop();
    if (node.tag === 'testsuite' && !node.hasTestcase && node.hasError) incomplete.push(fileIssue(node.file));
  }

  try {
    while (cursor < text.length) {
      if (text[cursor] !== '<') {
        const next = text.indexOf('<', cursor);
        const content = text.slice(cursor, next === -1 ? text.length : next);
        if ((!stack.length && content.trim()) || content.includes(']]>')) malformedXml();
        decodeXml(content);
        cursor += content.length;
        continue;
      }

      const opener = ['<!--', '<?', '<![CDATA['].find(prefix => text.startsWith(prefix, cursor));
      if (opener) {
        const closer = {'<!--': '-->', '<?': '?>', '<![CDATA[': ']]>'}[opener];
        const start = cursor + opener.length;
        const end = text.indexOf(closer, start);
        if (end === -1 || (opener === '<![CDATA[' && !stack.length) ||
          (opener === '<!--' && text.slice(start, end).includes('--'))) malformedXml();
        if (invalidXmlChar.test(text.slice(start, end))) malformedXml();
        cursor = end + closer.length;
        continue;
      }

      // Declarations other than comments and CDATA (including DOCTYPE) have no valid tag token.
      tagPattern.lastIndex = cursor;
      const token = tagPattern.exec(text);
      if (!token) malformedXml();
      cursor = tagPattern.lastIndex;
      const [, closing, tag, rawAttrs] = token;
      const parent = stack.at(-1);
      if (closing) {
        if (tag !== parent?.tag || rawAttrs.trim()) malformedXml();
        closeElement();
        continue;
      }
      if (!parent) {
        if (rootSeen || !['testsuites', 'testsuite'].includes(tag)) malformedXml();
        rootSeen = true;
      }

      const selfClosing = rawAttrs.endsWith('/');
      const attrs = xmlAttributes(selfClosing ? rawAttrs.slice(0, -1) : rawAttrs);
      const node = {tag, suite: parent?.suite};
      if (tag === 'testsuite') {
        const inferred = fileFromName(attrs.name, ctx);
        node.parentSuite = node.suite;
        node.suite = node;
        node.names = [...(node.parentSuite?.names ?? []), ...(attrs.name ? [attrs.name] : [])];
        node.explicitFile = attrs.file || node.parentSuite?.explicitFile;
        node.inferredFile = inferred === '-' ? node.parentSuite?.inferredFile : inferred;
        node.file = node.explicitFile
          ? normalizeTestFile(node.explicitFile, ctx.worktree) : node.inferredFile ?? '-';
        node.hasError = Number(attrs.errors) > 0;
      } else if (tag === 'testcase' && ['testsuite', 'testsuites'].includes(parent?.tag)) {
        const {suite} = node;
        const explicitFile = attrs.file || suite?.explicitFile;
        node.test = {
          file: explicitFile ? normalizeTestFile(explicitFile, ctx.worktree) : suite?.inferredFile ?? '-',
          suite: [...(suite?.names ?? []), ...(attrs.classname ? [attrs.classname] : [])].join('/'),
          name: attrs.name ?? '',
          status: 'passed',
          durationMs: duration(attrs.time, 1000)
        };
        tests.push(node.test);
        for (let ancestor = suite; ancestor; ancestor = ancestor.parentSuite) ancestor.hasTestcase = true;
      } else if (tag === 'error' && parent?.tag === 'testsuite') {
        parent.hasError = true;
      } else if (parent?.test) {
        if (tag === 'failure' || tag === 'error') parent.test.status = 'failed';
        if (tag === 'skipped' && parent.test.status !== 'failed') parent.test.status = 'skipped';
      }
      stack.push(node);
      if (selfClosing) closeElement();
    }
    if (stack.length || !rootSeen) malformedXml();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return {tests: [], incomplete: [commandIssue('parse_error')], unmappedStatusCount: 0};
  }
  return {tests: assignTestIds(tests), incomplete, unmappedStatusCount: 0};
}

function tapLocation(raw) {
  const quoted = /^(['"])(.*)\1$/.exec(raw);
  let value = raw;
  if (quoted?.[1] === "'") value = quoted[2].replaceAll("''", "'");
  if (quoted?.[1] === '"') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = quoted[2];
    }
  }
  const location = /^(.*):(\d+):(\d+)$/.exec(value);
  if (!location) return null;
  return {path: location[1], atFileStart: location[2] === '1' && location[3] === '1'};
}

const tapLevel = () => ({points: [], plan: null, child: null});

export function parseTap(text, ctx) {
  const root = tapLevel();
  const levels = [root];
  let invalid = false;
  let diagnostic = null;

  for (const line of text.split(/\r?\n/)) {
    const content = line.trimStart();
    if (diagnostic) {
      if (content === '...') diagnostic = null;
      else if (content.startsWith('duration_ms:')) diagnostic.durationMs = duration(content.slice(12).trim());
      else if (content.startsWith('location:')) diagnostic.location = tapLocation(content.slice(9).trim());
      else if (/^type:\s*(?:suite|'suite'|"suite")\s*$/.test(content)) diagnostic.isSuite = true;
      continue;
    }

    if (!content || /^TAP version (?:13|14)\s*$/.test(content)) continue;
    if (/^Bail out!/i.test(content)) {
      invalid = true;
      break;
    }
    const indent = line.length - content.length;
    const depth = Math.floor(indent / 4);
    if (depth > levels.length) {
      invalid = true;
      continue;
    }
    if (depth === levels.length) {
      const parent = levels.at(-1);
      parent.child ??= tapLevel();
      levels.push(parent.child);
    } else {
      levels.length = depth + 1;
    }
    const level = levels[depth];

    if (content === '---') {
      diagnostic = level.points.at(-1) ?? null;
      continue;
    }
    const subtest = /^# Subtest:\s*(.*)$/.exec(content);
    if (subtest) {
      level.child ??= tapLevel();
      level.child.name = subtest[1];
      continue;
    }
    const plan = /^1\.\.(\d+)(?:\s+.*)?$/.exec(content);
    if (plan) {
      if (level.plan !== null) invalid = true;
      level.plan = Number(plan[1]);
      continue;
    }
    const point = /^(not ok|ok)(?=\s|$)(?:[ \t]+(\d+)(?=[ \t]|$))?[ \t]*(?:-[ \t]+)?(.*)$/.exec(content);
    if (!point) continue;

    const description = point[3].trim();
    const directive = /(?:^|\s+)#\s*(?:skip|todo)(?=\s|$)/i.exec(description);
    const name = (directive ? description.slice(0, directive.index) : description).trim();
    level.points.push({
      name: name || level.child?.name || '',
      status: directive ? 'skipped' : point[1] === 'ok' ? 'passed' : 'failed',
      durationMs: null,
      child: level.child
    });
    level.child = null;
  }

  const tests = [];
  const incomplete = [];
  function visit(level, inheritedFile, suite, topLevel) {
    if ((level.plan !== null && level.plan !== level.points.length) ||
      (level.child && (level.child.points.length || level.child.plan !== null))) invalid = true;

    for (const point of level.points) {
      const headerFile = topLevel ? fileFromName(point.name, ctx) : '-';
      const located = normalizeTestFile(point.location?.path, ctx.worktree);
      const file = located !== '-' ? located : headerFile !== '-' ? headerFile : inheritedFile;
      const hasChildren = Boolean(point.child?.points.length);
      if (hasChildren) {
        const childSuite = headerFile === '-' ? [suite, point.name].filter(Boolean).join('/') : suite;
        visit(point.child, file, childSuite, false);
      } else if (point.child) {
        visit(point.child, file, suite, false);
      }
      if (hasChildren) continue;

      if (point.status === 'failed') {
        const namedFile = normalizeTestFile(point.name, ctx.worktree);
        if (namedFile !== '-' && ctx.fileExists(namedFile)) {
          incomplete.push(fileIssue(namedFile));
          continue;
        }
        // Node attaches source locations to ordinary failures too. Its top-level file point starts at 1:1.
        if (!point.isSuite && topLevel && point.location?.atFileStart && located !== '-' && ctx.fileExists(located)) {
          incomplete.push(fileIssue(located));
          continue;
        }
      }
      if (!point.isSuite) tests.push({file, suite, name: point.name, status: point.status, durationMs: point.durationMs});
    }
  }

  visit(root, '-', '', true);
  if (invalid || diagnostic) incomplete.push(commandIssue('parse_error'));
  return {tests: assignTestIds(tests), incomplete, unmappedStatusCount: 0};
}

export function validateRegexSpec(results) {
  try {
    if (typeof results?.pattern !== 'string') throw new TypeError('pattern must be a string');
    const pattern = new RegExp(results.pattern);
    // The empty alternative exposes the capture names even when the supplied pattern never matches "".
    const groups = new RegExp('(?:' + results.pattern + ')|').exec('').groups;
    if (!groups || !Object.hasOwn(groups, 'status') || !Object.hasOwn(groups, 'name')) {
      throw new SyntaxError('pattern requires named groups status and name');
    }
    return pattern;
  } catch (error) {
    throw Object.assign(new Error('Invalid regex results pattern: ' + error.message), {code: 'invalid_request'});
  }
}

export function parseRegex(text, ctx, results) {
  const pattern = validateRegexSpec(results);
  const statuses = new Map();
  for (const [field, status] of [['pass', 'passed'], ['fail', 'failed'], ['skip', 'skipped'], ['fileError', 'file_error']]) {
    for (const value of results.statusMap[field] ?? []) statuses.set(value, status);
  }
  const tests = [];
  const incomplete = [];
  let unmappedStatusCount = 0;
  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (!match) continue;
    const group = match.groups;
    const status = statuses.get(group.status);
    if (!status) {
      unmappedStatusCount++;
      continue;
    }
    const file = normalizeTestFile(group.file, ctx.worktree);
    if (status === 'file_error') incomplete.push(fileIssue(file));
    else tests.push({file, suite: group.suite ?? '', name: group.name ?? '', status, durationMs: duration(group.duration)});
  }
  return {tests: assignTestIds(tests), incomplete, unmappedStatusCount};
}

function countTests(tests) {
  const counts = {total: tests.length, passed: 0, failed: 0, skipped: 0};
  for (const {status} of tests) counts[status]++;
  return counts;
}

export function summarizeCommand({format, results, streams, resultFiles, exit, truncated, ctx}) {
  const {code: exitCode, signal = null, timedOut = false} = exit;
  const badExit = exitCode !== 0 || Boolean(signal) || timedOut;
  const tests = [];
  const incomplete = [];
  let unmappedStatusCount = 0;
  const summary = {format, exitCode, signal, timedOut};

  if (format === 'none') {
    return {...summary, tests, counts: countTests(tests), incomplete, unmappedStatusCount,
      status: badExit ? 'fail' : 'pass'};
  }

  let texts;
  if (results.stream === 'both') texts = [(streams.stdout ?? '') + '\n' + (streams.stderr ?? '')];
  else if (results.stream) texts = [streams[results.stream] ?? ''];
  else {
    texts = (resultFiles ?? []).map(({text}) => text);
    if (!texts.length) incomplete.push(commandIssue('results_missing'));
  }

  const parse = {'junit-xml': parseJunitXml, tap: parseTap, regex: parseRegex}[format];
  for (const text of texts) {
    const parsed = parse(text, ctx, results);
    for (const item of parsed.tests) tests.push(item);
    for (const issue of parsed.incomplete) incomplete.push(issue);
    unmappedStatusCount += parsed.unmappedStatusCount;
  }
  const counts = countTests(tests);
  if (badExit && !counts.failed) incomplete.push(commandIssue('unattributed'));
  if (!counts.total) incomplete.push(commandIssue('no_results'));
  if (truncated) incomplete.push(commandIssue('output_truncated'));

  const uniqueIssues = new Map(incomplete.map(issue => [JSON.stringify([issue.scope, issue.path, issue.reason]), issue]));
  return {...summary, tests: assignTestIds(tests), counts, incomplete: [...uniqueIssues.values()], unmappedStatusCount};
}

function incompleteFor(summary, file) {
  return summary.incomplete.find(issue => issue.scope === 'command' || issue.path === file);
}

function testKey(commandId, testId) {
  return JSON.stringify([commandId, testId]);
}

function intermittentTests(base, head, history, reruns) {
  const evidence = new Map();
  const failures = new Map([base, head].map(run => [run.runId, new Set(run.commands.flatMap(({id, summary}) =>
    summary.tests.filter(test => test.status === 'failed').map(test => testKey(id, test.testId))))]));

  function evidenceFor(commandId, testId) {
    const key = testKey(commandId, testId);
    if (!evidence.has(key)) evidence.set(key, {commandId, testId, byCacheKey: new Map(), byRun: new Map()});
    return evidence.get(key);
  }

  for (const {runId, loadClass, commands, cacheKey} of history) {
    for (const {id, summary} of commands) {
      for (const {testId, status} of summary.tests) {
        const {byCacheKey} = evidenceFor(id, testId);
        if (!byCacheKey.has(cacheKey)) byCacheKey.set(cacheKey, []);
        byCacheKey.get(cacheKey).push({runId, loadClass, status});
      }
    }
  }
  for (const {runId = head.runId, commandId, testId, attempts} of reruns) {
    const {byRun} = evidenceFor(commandId, testId);
    if (!byRun.has(runId)) byRun.set(runId, []);
    for (const attempt of attempts) byRun.get(runId).push(attempt);
  }

  const candidates = [];
  for (const [key, {commandId, testId, byCacheKey, byRun}] of evidence) {
    const varyingHistory = [...byCacheKey.values()].filter(rows => new Set(rows.map(row => row.status)).size > 1).flat();
    const varyingReruns = [...byRun].some(([runId, attempts]) => {
      const statuses = new Set(attempts.map(({status}) => status));
      return statuses.size > 1 || failures.get(runId)?.has(key) && statuses.has('passed');
    });
    if (varyingHistory.length || varyingReruns) {
      const attempts = [...byRun.values()].flat();
      const passes = attempts.some(({status}) => status === 'passed');
      candidates.push({commandId, testId, history: varyingHistory, reruns: attempts, passesInIsolation: passes ? 'yes' : 'no'});
    }
  }
  return candidates;
}

export function compareRuns({base, head, history = [], reruns = []}) {
  const comparison = {
    newFailures: [],
    baselineReproduced: [],
    baselineNotReproduced: [],
    newFailureCandidates: [],
    intermittentCandidates: intermittentTests(base, head, history, reruns),
    disappearedTests: [],
    addedTests: [],
    addedFiles: [],
    removedFiles: []
  };
  const baseCommands = new Map(base.commands.map(command => [command.id, command]));
  for (const current of head.commands) {
    const {id: commandId, summary} = current;
    const prior = baseCommands.get(commandId);
    const baseFiles = new Set(prior.expandedFiles);
    const headFiles = new Set(current.expandedFiles);
    for (const path of headFiles) {
      if (!baseFiles.has(path)) comparison.addedFiles.push({commandId, path});
    }
    for (const path of baseFiles) {
      if (!headFiles.has(path)) comparison.removedFiles.push({commandId, path});
    }

    for (const issue of summary.incomplete) {
      comparison.newFailureCandidates.push({commandId, testId: null, reason: issue.reason});
    }
    if (current.format === 'none') {
      if (summary.status === 'fail') comparison.newFailureCandidates.push({commandId, testId: null, reason: 'none_failed'});
      continue;
    }

    const baseTests = new Map(prior.summary.tests.map(test => [test.testId, test]));
    const headTests = new Map(summary.tests.map(test => [test.testId, test]));
    for (const [testId, test] of headTests) {
      const before = baseTests.get(testId);
      const related = {commandId, testId};
      const baseIssue = incompleteFor(prior.summary, test.file);
      if (baseIssue) {
        if (test.status === 'failed') comparison.newFailureCandidates.push({...related, reason: baseIssue.reason});
        continue;
      }
      if (incompleteFor(summary, test.file)) continue;

      if (!before) comparison.addedTests.push(related);
      if (test.status === 'failed') {
        if (before?.status === 'failed') comparison.baselineReproduced.push(related);
        else comparison.newFailures.push(related);
      } else if (test.status === 'passed' && before?.status === 'failed') {
        comparison.baselineNotReproduced.push(related);
      }
    }

    for (const [testId, {file}] of baseTests) {
      if (!headTests.has(testId) && !incompleteFor(prior.summary, file) && !incompleteFor(summary, file)) {
        comparison.disappearedTests.push({commandId, testId});
      }
    }
  }

  const hasCandidates = comparison.newFailureCandidates.length || comparison.intermittentCandidates.length;
  const verdict = comparison.newFailures.length ? 'new-failures' : hasCandidates ? 'candidates' : 'no-new-failures';
  return {...comparison, verdict};
}

function rankTimings(commands, phases, topN) {
  const files = [];
  const tests = [];
  for (const {id: commandId, summary} of commands) {
    const fileTimes = new Map();
    for (const {file, testId, durationMs} of summary.tests) {
      if (!Number.isFinite(durationMs) || durationMs < 0) continue;
      tests.push({commandId, testId, durationMs});
      if (file !== '-') fileTimes.set(file, (fileTimes.get(file) ?? 0) + durationMs);
    }
    for (const [file, durationMs] of fileTimes) files.push({commandId, file, durationMs});
  }
  const timeOrder = (a, b) => b.durationMs - a.durationMs;
  return {
    files: files.sort(timeOrder).slice(0, topN),
    tests: tests.sort(timeOrder).slice(0, topN),
    phases: phases.filter(phase => Number.isFinite(phase.ms) && phase.ms >= 0)
      .sort((a, b) => b.ms - a.ms).slice(0, topN)
  };
}

function runMetadata({runId, commit, tree, load, cacheHit, reusedFrom = null}) {
  return {runId, commit, tree, load, cacheHit, reusedFrom};
}

function commandReport({expandedFiles, summary}) {
  return {
    exitCode: summary.exitCode,
    wallMs: summary.wallMs ?? null,
    tests: summary.counts ?? countTests(summary.tests),
    incomplete: summary.incomplete,
    expandedFiles
  };
}

function mdValue(value) {
  const text = String(value ?? '-').replace(/\r\n|\n|\r/g, ' ');
  let fence = String.fromCharCode(96);
  for (const match of text.matchAll(/\x60+/g)) {
    if (match[0].length >= fence.length) fence = String.fromCharCode(96).repeat(match[0].length + 1);
  }
  return fence + ' ' + text + ' ' + fence;
}

function renderReportMd(json, topN) {
  const lines = ['# 최종 검증 보고서', '', '판정 ' + mdValue(json.verdict)];
  function section(title, rows) {
    lines.push('', '## ' + title, '');
    if (!rows.length) lines.push('- 없음');
    for (const row of rows) lines.push('- ' + row);
  }

  const identify = entry => [entry.commandId, entry.testId].filter(Boolean).map(mdValue).join(' / ');
  const {tmpdir, envNames, ...conditions} = json.conditions;
  section('기록 조건', [
    '기준선 ' + mdValue(json.base.runId) + ' / ' + mdValue(json.base.commit),
    'head ' + mdValue(json.head.runId) + ' / ' + mdValue(json.head.commit),
    ...Object.entries(conditions).map(([key, value]) => key + ' ' + mdValue(value)),
    'tmpdir ' + mdValue(tmpdir.realpath) + ' / ' + mdValue(tmpdir.fsType),
    'envNames ' + envNames.map(mdValue).join(', ')
  ]);
  const totals = ({tests, wallMs}) => {
    const wall = wallMs == null ? '-' : wallMs + ' ms';
    return '총 ' + tests.total + '건, 통과 ' + tests.passed + ', 실패 ' + tests.failed +
      ', 건너뜀 ' + tests.skipped + ', 실행 시간 ' + wall;
  };
  section('명령별 합계 및 실행 시간', json.commands.map(({id, base, head}) =>
    mdValue(id) + ' / 기준선 ' + totals(base) + ' / head ' + totals(head)));
  section('새 실패', json.newFailures.map(identify));
  section('기준선 재현', json.baselineReproduced.map(identify));
  section('기준선 미재현', json.baselineNotReproduced.map(identify));
  section('간헐 후보', json.intermittentCandidates.map(entry => {
    const runs = entry.history.map(({runId, loadClass, status}) => [runId, loadClass, status].map(mdValue).join(' / '));
    const attempts = entry.reruns.map(({attempt, status}) => attempt + '회 ' + mdValue(status));
    return [
      identify(entry),
      '단독 통과 ' + mdValue(entry.passesInIsolation),
      '시도 ' + entry.reruns.length + '회' + (attempts.length ? ' (' + attempts.join(', ') + ')' : ''),
      ...(runs.length ? ['이력 ' + runs.join(', ')] : [])
    ].join(' · ');
  }));
  section('incomplete 및 none 후보', json.newFailureCandidates.map(entry =>
    identify(entry) + ' / ' + mdValue(entry.reason)));
  section('사라진 테스트 및 새 테스트', [
    ...json.disappearedTests.map(entry => '사라진 테스트 ' + identify(entry)),
    ...json.addedTests.map(entry => '새 테스트 ' + identify(entry)),
    ...json.removedFiles.map(({commandId, path}) => '제외된 파일 ' + mdValue(commandId) + ' / ' + mdValue(path)),
    ...json.addedFiles.map(({commandId, path}) => '추가된 파일 ' + mdValue(commandId) + ' / ' + mdValue(path))
  ]);
  section('느린 상위 ' + topN + '개', [
    ...json.slowest.files.map(entry => '파일 ' + identify({...entry, testId: entry.file}) + ' / ' + entry.durationMs + ' ms'),
    ...json.slowest.tests.map(entry => '테스트 ' + identify(entry) + ' / ' + entry.durationMs + ' ms'),
    ...json.slowest.phases.map(({name, ms}) => 'prepare 단계 ' + mdValue(name) + ' / ' + ms + ' ms')
  ]);
  return lines.join('\n') + '\n';
}

export function buildReport({base, head, comparison, conditions, phases = [], topN = 10, generatedAt}) {
  const baseCommands = new Map(base.commands.map(command => [command.id, command]));
  const json = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    base: runMetadata(base),
    head: runMetadata(head),
    conditions,
    commands: head.commands.map(command => ({
      id: command.id,
      base: commandReport(baseCommands.get(command.id)),
      head: commandReport(command)
    })),
    ...comparison,
    slowest: rankTimings(head.commands, phases, topN),
    generatedAt
  };
  return {json, md: renderReportMd(json, topN)};
}
