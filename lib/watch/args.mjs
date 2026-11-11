import fs from 'node:fs';
import {WATCH_LIMITS as L} from './model.mjs';

export function parseWatchArgs(argv) {
  const options = {mode:'default',dir:null,session:null,platforms:['codex','claude'],tail:L.defaultTail,verbose:false,json:false,width:null,help:false};
  const seen = new Set(), values = ['cwd','session','platform','tail','width'];
  const fail = message => ({ok:false,message});
  for (let i = 0; i < argv.length; i++) {
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) return fail(`Unsupported argument: ${argv[i]}`);
    const [, name, inline] = match;
    if (![...values,'all','verbose','json','help'].includes(name)) return fail(`Unknown option: --${name}`);
    if (seen.has(name)) return fail(`Duplicate option: --${name}`);
    seen.add(name);
    if (!values.includes(name)) {
      if (inline !== undefined) return fail(`--${name} does not take a value`);
      if (name !== 'all') options[name] = true;
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === '' || value.startsWith('--')) return fail(`Missing value for --${name}`);
    if (name === 'tail' || name === 'width') {
      const n = Number(value), min = name === 'tail' ? 0 : L.widthMin, max = name === 'tail' ? L.maxTail : L.widthMax;
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) return fail(`--${name} must be an integer from ${min} to ${max}`);
      options[name] = n;
    } else if (name === 'platform') {
      if (!['codex','claude'].includes(value)) return fail('--platform must be codex or claude');
      options.platforms = [value];
    } else if (name === 'session') {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) return fail('Invalid session id');
      options.session = value;
    } else {
      try {
        if (!fs.statSync(value).isDirectory()) return fail('--cwd must name an existing directory');
        options.dir = fs.realpathSync(value);
      } catch { return fail('--cwd must name an existing directory'); }
    }
  }
  const modes = ['cwd','all','session'].filter(name => seen.has(name));
  if (modes.length > 1) return fail('--cwd, --all and --session are mutually exclusive');
  if (modes.length) options.mode = modes[0];
  return {ok:true,options};
}
