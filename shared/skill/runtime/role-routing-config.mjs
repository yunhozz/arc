export const ROUTING_ROLES = Object.freeze(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer']);
const validText = value => typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export function validRoleValues(platform, model, effort) {
  return ['codex', 'claude'].includes(platform) && validText(model) && validText(effort) && (platform !== 'claude' || (/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(model) && ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)));
}
export function validateRoleRoutingConfig(config) {
  if (!exact(config, ['version', 'revision', 'roles']) || config.version !== 1 || !validText(config.revision) || !exact(config.roles, ROUTING_ROLES)) throw Error('Invalid role routing configuration');
  for (const role of ROUTING_ROLES) {
    const fields = config.roles[role];
    if (!exact(fields, ['platform', 'model', 'effort']) || !validRoleValues(fields.platform, fields.model, fields.effort)) throw Error(`Invalid role routing values for ${role}`);
  }
  return structuredClone(config);
}
export function parseRoleRoutingConfig(text) {
  let value; try { value = JSON.parse(text); } catch { throw Error('Invalid role routing configuration'); }
  return validateRoleRoutingConfig(value);
}
export function serializeRoleRoutingConfig(config) { return JSON.stringify(validateRoleRoutingConfig(config), null, 2) + '\n'; }
