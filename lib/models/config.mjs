import { validRoleValues } from '../runtime/role-routing-config.mjs';
import { runtimeRegistryOf } from '../runtime/platform-registry.mjs';
import { parse, stringify } from '../../vendor/toml/dist/index.js';
export const ROLES = Object.freeze(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_tester', 'arc_reviewer']);
export const MODEL_SCHEMA_VERSION = 4;
export const LEGACY_ROLE_KEYS = Object.freeze({arc_qa: 'arc_tester'});
export class ModelValidationError extends Error {
  constructor(message, options) { super(message, options); this.name = 'ModelValidationError'; this.code = 'ARC_MODEL_VALIDATION'; }
}
export function fail(message) { throw new ModelValidationError(message); }
export function platformOf(config, opts = {}) {
  if (runtimeRegistryOf(opts).isPlatformId(config?.platform) && [1, 2, 3, MODEL_SCHEMA_VERSION].includes(config.version)) return config.platform;
  fail('Unsupported model schema version');
}
export function effortField(platform, opts = {}) {
  const descriptor = runtimeRegistryOf(opts).getPlatform(platform);
  if (descriptor) return descriptor.models.effortField;
  fail('Unknown model platform');
}
export function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(`${label} must contain exactly ${keys.join(', ')}`);
}
function string(value, label) {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\p{Cc}\u2028\u2029]/u.test(value)) fail(`${label} must be a nonempty string without whitespace or control characters`);
}
export function validateRoles(roles, platform, opts = {}) {
  const effort = effortField(platform, opts); exactKeys(roles, ROLES, 'roles');
  for (const [role, fields] of Object.entries(roles)) {
    exactKeys(fields, ['model', effort], role); string(fields.model, `${role}.model`); string(fields[effort], `${role}.${effort}`);
    if (!validRoleValues(platform, fields.model, fields[effort], opts)) fail(`${role}: unsupported Claude model identifier or effort`);
  }
  return structuredClone(roles);
}
const legacyPresets = ['economy', 'balanced', 'smart'];
function normalizeLegacyRoles(config) {
  if (Array.isArray(config)) return config;
  let normalized = config;
  for (const field of ['roles', 'custom']) {
    const roles = config[field];
    if (!roles || typeof roles !== 'object' || Array.isArray(roles)) continue;
    for (const [legacy, current] of Object.entries(LEGACY_ROLE_KEYS)) {
      if (!Object.hasOwn(roles, legacy)) continue;
      if (config.version === MODEL_SCHEMA_VERSION) fail(`version 4 must not contain ${legacy}`);
      if (Object.hasOwn(roles, current)) fail(`${field} must not contain both ${legacy} and ${current}`);
      normalized = {...normalized, [field]: Object.fromEntries(Object.entries(roles).map(([role, settings]) => [role === legacy ? current : role, settings]))};
    }
  }
  return normalized;
}
export function validateModelConfig(config, opts = {}) {
  const platform = platformOf(config, opts);
  config = normalizeLegacyRoles(config);
  if (config.version >= 3) {
    exactKeys(config, ['platform', 'version', 'roles'], 'model config');
    return {platform, version: MODEL_SCHEMA_VERSION, roles: validateRoles(config.roles, platform, opts)};
  }
  const hasCustom = Object.hasOwn(config, 'custom');
  exactKeys(config, ['platform', 'version', 'preset', 'roles', ...(hasCustom && config.version === 2 ? ['custom'] : [])], 'model config');
  if (![...legacyPresets, 'custom'].includes(config.preset) || (config.preset === 'custom' && !hasCustom)) fail('Unsupported legacy preset or missing custom roles');
  exactKeys(config.roles, ROLES, 'roles');
  for (const role of ROLES) exactKeys(config.roles[role], legacyPresets, `roles.${role}`);
  for (const preset of legacyPresets) validateRoles(Object.fromEntries(ROLES.map(role => [role, config.roles[role][preset]])), platform, opts);
  if (hasCustom) validateRoles(config.custom, platform, opts);
  return {platform, version: MODEL_SCHEMA_VERSION, roles: structuredClone(config.preset === 'custom' ? config.custom : Object.fromEntries(ROLES.map(role => [role, config.roles[role][config.preset]])))};
}
export function resolveModelSettings(config, opts = {}) {
  const {platform, roles} = validateModelConfig(config, opts);
  return {platform, roles};
}
export function parseToml(text) {
  try { return parse(typeof text === 'string' ? text : new TextDecoder('utf-8', { fatal: true }).decode(text), { integersAsBigInt: true }); }
  catch (cause) { throw new ModelValidationError(`Invalid TOML: ${cause.message}`, { cause }); }
}
export function readModelFileVersion(text) {
  const {version} = parseToml(text);
  if (![1n, 2n, 3n, BigInt(MODEL_SCHEMA_VERSION)].includes(version)) fail('Expected integer schema version 1, 2, 3 or 4; reinstall or update models.toml');
  return Number(version);
}
export function loadModelConfig(text, platform, opts = {}) {
  effortField(platform, opts); const config = parseToml(text);
  const version = readModelFileVersion(text);
  const hasCustom = Object.hasOwn(config, 'custom');
  exactKeys(config, version >= 3 ? ['version', 'roles'] : ['version', 'preset', 'roles', ...(hasCustom && version === 2 ? ['custom'] : [])], 'model file');
  return validateModelConfig({...config, platform, version}, opts);
}
export function serializeModelConfig(config, opts = {}) { const {platform, ...file} = validateModelConfig(config, opts); return stringify(file); }
export function withRoles(config, roles, opts = {}) {
  const validated = validateModelConfig(config, opts);
  return {...validated, roles: validateRoles(roles, validated.platform, opts)};
}
