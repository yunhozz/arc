import { parse, stringify } from '../../vendor/toml/dist/index.js';
export const ROLES = Object.freeze(['arc_scouter', 'arc_planner', 'arc_coder', 'arc_qa', 'arc_reviewer']);
export class ModelValidationError extends Error {
  constructor(message, options) { super(message, options); this.name = 'ModelValidationError'; this.code = 'ARC_MODEL_VALIDATION'; }
}
export function fail(message) { throw new ModelValidationError(message); }
export function platformOf(config) {
  if (config?.platform === 'codex' && config.version === 5) return 'codex';
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
export function validateModelConfig(config) {
  exactKeys(config, ['platform', 'version', 'roles'], 'model config'); const platform = platformOf(config);
  return { platform, version: config.version, roles: validateRoles(config.roles, platform) };
}
export function parseToml(text) {
  try { return parse(typeof text === 'string' ? text : new TextDecoder('utf-8', { fatal: true }).decode(text), { integersAsBigInt: true }); }
  catch (cause) { throw new ModelValidationError(`Invalid TOML: ${cause.message}`, { cause }); }
}
export function loadModelConfig(text, platform) {
  effortField(platform); const config = parseToml(text); exactKeys(config, ['version', 'roles'], 'model file');
  if (config.version !== (platform === 'codex' ? 5n : 1n)) fail(`Expected ${platform} integer schema version ${platform === 'codex' ? 5 : 1}`);
  return validateModelConfig({ platform, version: Number(config.version), roles: config.roles });
}
export function serializeModelConfig(config) { const { version, roles } = validateModelConfig(config); return stringify({ version, roles }); }
export function loadPresets(text, platform) {
  const overlay = parseToml(text); if (overlay.version !== 1n) fail('Preset overlays require integer version 1');
  const result = { ...overlay, version: 1 }; validatePresets(result, platform); return result;
}
function validatePresets(overlay, platform) {
  exactKeys(overlay, ['version', 'presets'], 'preset overlay'); if (overlay.version !== 1) fail('Invalid preset overlay version');
  exactKeys(overlay.presets, ['balanced', 'smart'], 'presets');
  for (const preset of ['balanced', 'smart']) { exactKeys(overlay.presets[preset], ['roles'], `${preset} preset`); validateRoles(overlay.presets[preset].roles, platform); }
}
export function applyPreset(config, preset, overlayText) {
  const validated = validateModelConfig(config); const platform = platformOf(validated);
  if (!['economy', 'balanced', 'smart'].includes(preset)) fail('Unsupported performance preset');
  if (preset === 'economy') return validated;
  if (typeof overlayText !== 'string' && !Buffer.isBuffer(overlayText)) fail('Preset overlay must be verified TOML text');
  const overlay = loadPresets(overlayText, platform);
  return { platform, version: validated.version, roles: validateRoles(overlay.presets[preset].roles, platform) };
}
