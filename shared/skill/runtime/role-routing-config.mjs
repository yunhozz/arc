import {runtimeRegistryOf} from './platform-registry.mjs';

export const ROUTING_ROLES = Object.freeze(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer']);
const validText = value => typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const v1Platforms = Object.freeze(['codex', 'claude']);
const isV1Platforms = platforms => platforms.length === v1Platforms.length && v1Platforms.every((id, index) => platforms[index] === id);
// Keep injected validation context out of the public config and serialized bytes.
const configRegistries = new WeakMap();

export function validRoleValues(platform, model, effort, {runtimePlatforms} = {}) {
  const registry = runtimeRegistryOf({runtimePlatforms});
  return registry.isPlatformId(platform) && registry.getPlatform(platform).routing.validatePair(model, effort);
}
export function validateRoleRoutingConfig(config, opts = {}) {
  const keys = ['version', 'revision', 'platforms', 'roles'];
  if (!(exact(config, keys) || (config?.version === 1 && exact(config, ['version', 'revision', 'roles']))) || ![1, 2].includes(config.version) || !validText(config.revision) || !exact(config.roles, ROUTING_ROLES)) throw Error('Invalid role routing configuration');
  const registry = runtimeRegistryOf(opts);
  const platforms = config.version === 1 && !Object.hasOwn(config, 'platforms') ? [...v1Platforms] : config.platforms;
  if (!Array.isArray(platforms) || platforms.length < 2 || new Set(platforms).size !== platforms.length || platforms.some(id => !registry.isPlatformId(id))) throw Error('Invalid role routing platforms');
  if (platforms.some((id, index) => index > 0 && registry.getPlatform(platforms[index - 1]).anchorOrder >= registry.getPlatform(id).anchorOrder) || (config.version === 1 && !isV1Platforms(platforms))) throw Error('Invalid role routing platforms');
  for (const role of ROUTING_ROLES) {
    const fields = config.roles[role];
    if (!exact(fields, ['platform', 'model', 'effort']) || !validRoleValues(fields.platform, fields.model, fields.effort, opts) || !platforms.includes(fields.platform)) throw Error(`Invalid role routing values for ${role}`);
  }
  const result = structuredClone({version: config.version, revision: config.revision, platforms, roles: config.roles});
  configRegistries.set(result, registry);
  return result;
}
export function parseRoleRoutingConfig(text, opts) {
  let value; try { value = JSON.parse(text); } catch { throw Error('Invalid role routing configuration'); }
  return validateRoleRoutingConfig(value, opts);
}
export function serializeRoleRoutingConfig(config) {
  const {revision, platforms, roles} = validateRoleRoutingConfig(config, {runtimePlatforms: configRegistries.get(config)});
  const value = {version: 2, revision, platforms, roles};
  return JSON.stringify(value, null, 2) + '\n';
}
export function buildRoleRoutingConfig({revision, platforms = [], roles}, opts = {}) {
  const registry = runtimeRegistryOf(opts);
  if (!Array.isArray(platforms)) throw Error('Invalid role routing platforms');
  const participating = [...new Set([...platforms, ...Object.values(roles).map(fields => fields.platform)])];
  if (participating.some(id => !registry.isPlatformId(id))) throw Error('Invalid role routing platforms');
  participating.sort((a, b) => registry.getPlatform(a).anchorOrder - registry.getPlatform(b).anchorOrder);
  return validateRoleRoutingConfig({version: 2, revision, platforms: participating, roles}, opts);
}
