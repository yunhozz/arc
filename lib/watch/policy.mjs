import {VERBOSE_KINDS} from './model.mjs';

export function maskSecrets(text) {
  const secretName = /(?:password|passwd|pass|secret|token|api[_-]?key|access_key|private_key|auth)$/i;
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g, '***')
    .replace(/:\/\/[^\s/@:]+:[^\s/@]*@/g, '://***@')
    .replace(/\bAuthorization\s*:\s*(?:[A-Za-z]+\s+)?[^\s"']+/gi, 'Bearer ***')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer ***')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})/g, '***')
    .replace(/(^|[^\w-])([A-Za-z_][\w-]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"',;]+)/g,
      (match, prefix, key, separator) => secretName.test(key) ? `${prefix}${key}${separator}***` : match)
    .replace(/--([A-Za-z_][\w-]*)([ \t]+)("[^"]*"|'[^']*'|[^\s"',;]+)/g,
      (match, key, separator) => secretName.test(key) ? `--${key}${separator}***` : match);
}

export function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  const plain = value
    .replace(/(?:\x1b\]|\u009d)[\s\S]*?(?:\x07|\x1b\\|\u009c|$)/g, '')
    .replace(/(?:\x1b\[|\u009b)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\t\n\r\v\f]/g, ' ')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
    .replace(/\s+/gu, ' ').trim();
  return maskSecrets(plain);
}

export function clipCodePoints(text, max) {
  const points = [...text];
  const limit = Math.max(0, Math.floor(max));
  if (points.length <= limit) return {text, truncated:false};
  return {text:limit === 0 ? '' : points.slice(0, limit - 1).join('') + '…', truncated:true};
}

export function isVisible(kind, verbose) {
  return Boolean(verbose) || !VERBOSE_KINDS.includes(kind);
}
