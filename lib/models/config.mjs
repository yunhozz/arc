import { parse, stringify } from '../../vendor/toml/dist/index.js';
export const ROLES = Object.freeze(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer', 'arc_orchestrator']);
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
export function validateRoles(roles, platform, roleKeys = ROLES) {
  const effort = effortField(platform); exactKeys(roles, roleKeys, 'roles');
  for (const [role, fields] of Object.entries(roles)) {
    exactKeys(fields, ['model', effort], role); string(fields.model, `${role}.model`); string(fields[effort], `${role}.${effort}`);
    if (platform === 'claude' && (!/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(fields.model) || !['low', 'medium', 'high', 'xhigh', 'max'].includes(fields.effort))) fail(`${role}: unsupported Claude model identifier or effort`);
  }
  return structuredClone(roles);
}
export const PRESETS = Object.freeze(['economy', 'balanced', 'smart']);
export function validateModelConfig(config) {
  const platform = platformOf(config);
  const hasCustom = Object.hasOwn(config, 'custom');
  exactKeys(config, ['platform', 'version', 'preset', 'roles', ...(hasCustom && config.version >= 2 ? ['custom'] : [])], 'model config');
  if (![...PRESETS, 'custom'].includes(config.preset) || (config.preset === 'custom' && !hasCustom)) fail('Unsupported performance preset or missing custom roles');
  exactKeys(config.roles, ROLES, 'roles');
  for (const role of ROLES) exactKeys(config.roles[role], PRESETS, `roles.${role}`);
  for (const preset of PRESETS) validateRoles(Object.fromEntries(ROLES.map(role => [role, config.roles[role][preset]])), platform);
  if (hasCustom) validateRoles(config.custom, platform);
  return { ...structuredClone(config), version: 3 };
}
export function resolveModelSettings(config) {
  const validated = validateModelConfig(config);
  return { platform: validated.platform, roles: validated.preset === 'custom' ? validated.custom : Object.fromEntries(ROLES.map(role => [role, validated.roles[role][validated.preset]])) };
}
export function parseToml(text) {
  try { return parse(typeof text === 'string' ? text : new TextDecoder('utf-8', { fatal: true }).decode(text), { integersAsBigInt: true }); }
  catch (cause) { throw new ModelValidationError(`Invalid TOML: ${cause.message}`, { cause }); }
}
export function loadModelConfig(text, platform, canonicalDefaults) {
  effortField(platform); const config = parseToml(text);
  if (config.version !== 1n && config.version !== 2n && config.version !== 3n) fail(`Expected ${platform} integer schema version 1, 2 or 3; reinstall or update models.toml`);
  const hasCustom = Object.hasOwn(config, 'custom');
  exactKeys(config, ['version', 'preset', 'roles', ...(hasCustom && config.version >= 2n ? ['custom'] : [])], 'model file (reinstall or update legacy role-only settings)');
  if (config.version < 3n && !Object.hasOwn(config.roles ?? {}, 'arc_orchestrator')) {
    const legacyRoles = ROLES.slice(0, -1);
    exactKeys(config.roles, legacyRoles, 'roles');
    for (const role of legacyRoles) exactKeys(config.roles[role], PRESETS, `roles.${role}`);
    for (const preset of PRESETS) validateRoles(Object.fromEntries(legacyRoles.map(role => [role, config.roles[role][preset]])), platform, legacyRoles);
    if (hasCustom) validateRoles(config.custom, platform, legacyRoles);
    const defaults = validateModelConfig(canonicalDefaults);
    if (defaults.platform !== platform) fail('Canonical defaults platform mismatch');
    config.roles.arc_orchestrator = structuredClone(defaults.roles.arc_orchestrator);
    if (hasCustom) config.custom.arc_orchestrator = structuredClone(defaults.roles.arc_orchestrator.balanced);
  }
  return validateModelConfig({ ...config, platform, version: Number(config.version) });
}
export function serializeModelConfig(config) { const { platform, ...file } = validateModelConfig(config); return stringify(file); }
export function applyPreset(config, preset) {
  const validated = validateModelConfig(config);
  if (![...PRESETS, 'custom'].includes(preset) || (preset === 'custom' && !validated.custom)) fail('Unsupported performance preset or missing custom roles');
  return { ...validated, preset };
}
export function applyCustomRoles(config, roles) {
  const validated = validateModelConfig(config);
  return { ...validated, preset: 'custom', custom: validateRoles(roles, validated.platform) };
}
