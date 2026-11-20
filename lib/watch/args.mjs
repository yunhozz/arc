import {WATCH_LIMITS as L} from './model.mjs';

export function parseWatchArgs(argv) {
  const options = {tail:L.defaultTail,verbose:false,json:false,width:null,help:false};
  const seen = new Set(), values = ['tail','width'];
  const fail = message => ({ok:false,message});
  for (let i = 0; i < argv.length; i++) {
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) return fail('Unsupported argument: '+argv[i]);
    const [, name, inline] = match;
    if (!Object.hasOwn(options,name)) return fail('Unknown option: --'+name);
    if (seen.has(name)) return fail('Duplicate option: --'+name);
    seen.add(name);
    if (!values.includes(name)) {
      if (inline !== undefined) return fail('--'+name+' does not take a value');
      options[name] = true;
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === '' || value.startsWith('--')) return fail('Missing value for --'+name);
    const n = Number(value), min = name === 'tail' ? 0 : L.widthMin, max = name === 'tail' ? L.maxTail : L.widthMax;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) {
      return fail('--'+name+' must be an integer from '+min+' to '+max);
    }
    options[name] = n;
  }
  return {ok:true,options};
}
