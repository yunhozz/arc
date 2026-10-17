export function parsePositiveLimit(raw,label='limit') {
 if(typeof raw!=='string'||! /^[0-9]+$/.test(raw.trim())||!Number.isSafeInteger(Number(raw.trim()))||Number(raw.trim())<1)throw new Error(`${label} must be a positive safe ASCII decimal integer`);
 return Number(raw.trim());
}
export function resolveLimits({existing=null,overrides={}}={}) {
 const result={version:1};
 for(const [key,fallback] of [['max_total_subagents',100],['max_concurrent_subagents',5]]) {
  const value=overrides[key]??existing?.[key]??fallback;
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw new Error(`Invalid ${key}`);
  result[key]=value;
 }
 return result;
}
