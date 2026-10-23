import { parse, stringify } from '../../vendor/toml/dist/index.js';
export const ROLES = Object.freeze(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer']);
export class ModelValidationError extends Error {
  constructor(message, options) { super(message, options); this.name = 'ModelValidationError'; this.code = 'ARC_MODEL_VALIDATION'; }
}
export function fail(message) { throw new ModelValidationError(message); }
export function platformOf(config) {
  if (config?.platform === 'codex' && config.version === 1) return 'codex';
  if (config?.platform === 'claude' && config.version === 1) return 'claude';
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
    if (platform === 'claude' && (!/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(fields.model) || !['low', 'medium', 'high', 'xhigh', 'max'].includes(fields.effort))) fail(`${role}: unsupported Claude model identifier or effort`);
  }
  return structuredClone(roles);
}
export const PRESETS = Object.freeze(['economy', 'balanced', 'smart']);
export function validateModelConfig(config) {
  exactKeys(config, ['platform', 'version', 'preset', 'roles'], 'model config'); const platform = platformOf(config);
  if (!PRESETS.includes(config.preset)) fail('Unsupported performance preset');
  exactKeys(config.roles, ROLES, 'roles');
  for (const role of ROLES) exactKeys(config.roles[role], PRESETS, `roles.${role}`);
  for (const preset of PRESETS) validateRoles(Object.fromEntries(ROLES.map(role => [role, config.roles[role][preset]])), platform);
  return structuredClone(config);
}
export function resolveModelSettings(config) {
  const validated = validateModelConfig(config);
  return { platform: validated.platform, roles: Object.fromEntries(ROLES.map(role => [role, validated.roles[role][validated.preset]])) };
}
export function parseToml(text) {
  try { return parse(typeof text === 'string' ? text : new TextDecoder('utf-8', { fatal: true }).decode(text), { integersAsBigInt: true }); }
  catch (cause) { throw new ModelValidationError(`Invalid TOML: ${cause.message}`, { cause }); }
}
export function loadModelConfig(text, platform) {
  effortField(platform); const config = parseToml(text); exactKeys(config, ['version', 'preset', 'roles'], 'model file (reinstall or update legacy role-only settings)');
  if (config.version !== 1n) fail(`Expected ${platform} integer schema version 1; reinstall or update models.toml`);
  return validateModelConfig({ platform, version: 1, preset: config.preset, roles: config.roles });
}
export function serializeModelConfig(config) { const { version, preset, roles } = validateModelConfig(config); return stringify({ version, preset, roles }); }
export function applyPreset(config, preset) {
  const validated = validateModelConfig(config);
  if (!PRESETS.includes(preset)) fail('Unsupported performance preset');
  return { ...validated, preset };
}
