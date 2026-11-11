import { validRoleValues } from '../runtime/role-routing-config.mjs';
import { parse, stringify } from '../../vendor/toml/dist/index.js';
export const ROLES = Object.freeze(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer']);
export class ModelValidationError extends Error {
  constructor(message, options) { super(message, options); this.name = 'ModelValidationError'; this.code = 'ARC_MODEL_VALIDATION'; }
}
export function fail(message) { throw new ModelValidationError(message); }
export function platformOf(config) {
  if (['codex', 'claude'].includes(config?.platform) && [1, 2, 3].includes(config.version)) return config.platform;
  fail('Unsupported model schema version');
}
export function effortField(platform) {
  if (platform === 'codex') return 'model_reasoning_effort';
  if (platform === 'claude') return 'effort';
  fail('Unknown model platform');
}
export function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(`${label} must contain exactly ${keys.join(', ')}`);
}
function string(value, label) {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\p{Cc}\u2028\u2029]/u.test(value)) fail(`${label} must be a nonempty string without whitespace or control characters`);
}
export function validateRoles(roles, platform) {
  const effort = effortField(platform); exactKeys(roles, ROLES, 'roles');
  for (const [role, fields] of Object.entries(roles)) {
    exactKeys(fields, ['model', effort], role); string(fields.model, `${role}.model`); string(fields[effort], `${role}.${effort}`);
    if (!validRoleValues(platform, fields.model, fields[effort])) fail(`${role}: unsupported Claude model identifier or effort`);
  }
  return structuredClone(roles);
}
const legacyPresets = ['economy', 'balanced', 'smart'];
export function validateModelConfig(config) {
  const platform = platformOf(config);
  if (config.version === 3) {
    exactKeys(config, ['platform', 'version', 'roles'], 'model config');
    return {platform, version: 3, roles: validateRoles(config.roles, platform)};
  }
  const hasCustom = Object.hasOwn(config, 'custom');
  exactKeys(config, ['platform', 'version', 'preset', 'roles', ...(hasCustom && config.version === 2 ? ['custom'] : [])], 'model config');
  if (![...legacyPresets, 'custom'].includes(config.preset) || (config.preset === 'custom' && !hasCustom)) fail('Unsupported legacy preset or missing custom roles');
  exactKeys(config.roles, ROLES, 'roles');
  for (const role of ROLES) exactKeys(config.roles[role], legacyPresets, `roles.${role}`);
  for (const preset of legacyPresets) validateRoles(Object.fromEntries(ROLES.map(role => [role, config.roles[role][preset]])), platform);
  if (hasCustom) validateRoles(config.custom, platform);
  return {platform, version: 3, roles: structuredClone(config.preset === 'custom' ? config.custom : Object.fromEntries(ROLES.map(role => [role, config.roles[role][config.preset]])))};
}
export function resolveModelSettings(config) {
  const {platform, roles} = validateModelConfig(config);
  return {platform, roles};
}
export function parseToml(text) {
  try { return parse(typeof text === 'string' ? text : new TextDecoder('utf-8', { fatal: true }).decode(text), { integersAsBigInt: true }); }
  catch (cause) { throw new ModelValidationError(`Invalid TOML: ${cause.message}`, { cause }); }
}
export function readModelFileVersion(text) {
  const {version} = parseToml(text);
  if (![1n, 2n, 3n].includes(version)) fail('Expected integer schema version 1, 2 or 3; reinstall or update models.toml');
  return Number(version);
}
export function loadModelConfig(text, platform) {
  effortField(platform); const config = parseToml(text);
  const version = readModelFileVersion(text);
  const hasCustom = Object.hasOwn(config, 'custom');
  exactKeys(config, version === 3 ? ['version', 'roles'] : ['version', 'preset', 'roles', ...(hasCustom && version === 2 ? ['custom'] : [])], 'model file');
  return validateModelConfig({...config, platform, version});
}
export function serializeModelConfig(config) { const {platform, ...file} = validateModelConfig(config); return stringify(file); }
export function withRoles(config, roles) {
  const validated = validateModelConfig(config);
  return {...validated, roles: validateRoles(roles, validated.platform)};
}
