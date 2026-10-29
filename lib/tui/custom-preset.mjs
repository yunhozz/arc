import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROLES, effortField, validateRoles } from '../models/config.mjs';
import { assertCatalogRoles, discoverModelCatalog, listCodexModelCapabilities } from '../models/catalog.mjs';
import { escapeTerminalText, wrapDetailRows } from './render.mjs';
import { resolveTarget } from '../installer/targets.mjs';

const names = ['Scouter', 'Planner', 'Implementer', 'QA', 'Reviewer'];
const unavailable = () => ({ status: 'unavailable', code: 'unavailable', message: 'Catalog is unavailable.' });

async function assertProjectless(directory) {
  for (let current = directory;; current = path.dirname(current)) {
    for (const name of ['.git', '.codex']) {
      try { await fs.lstat(path.join(current, name)); throw Error('Project configuration is present'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (path.dirname(current) === current) break;
  }
}

export async function loadCustomCatalog({ platform, env = process.env, signal, fetchImpl, listCodexModels = listCodexModelCapabilities, tempDir = os.tmpdir(), invocationCwd = process.cwd(), userHome = os.homedir() } = {}) {
  if (platform !== 'codex') return discoverModelCatalog({ platform, env, signal, fetchImpl });
  let directory, result;
  try {
    const childEnv = env?.CODEX_HOME === undefined ? env : { ...env, CODEX_HOME: resolveTarget('codex', { env, cwd: invocationCwd, userHome }).home };
    const base = await fs.realpath(tempDir);
    await assertProjectless(base);
    directory = await fs.mkdtemp(path.join(base, 'arc-model-catalog-'));
    const cwd = await fs.realpath(directory);
    await assertProjectless(cwd);
    result = await discoverModelCatalog({ platform, env: childEnv, signal, listCodexModels: options => listCodexModels({ ...options, cwd }) });
  } catch { result = unavailable(); }
  finally { if (directory) try { await fs.rm(directory, { recursive: true, force: true }); } catch { result = unavailable(); } }
  return result;
}

function pairKey(model, effort) { return JSON.stringify([model, effort]); }
function short(value, limit = 12) {
  const characters = [...escapeTerminalText(value)];
  return characters.length > limit ? characters.slice(0, limit - 1).join('') + '…' : characters.join('');
}

function details(model, effort, { columns = 80, rows = 24 } = {}) {
  const budget = Math.min(4, Math.max(0, rows - 12));
  if (budget < 2) return [];
  return [...wrapDetailRows([`Model: ${model}`], columns).slice(0, budget - 1), ...wrapDetailRows([`Effort: ${effort}`], columns).slice(0, 1)];
}

export async function editCustomPreset({ ui, config, initialRoles, catalog }) {
  const platform = config.platform, field = effortField(platform), roles = validateRoles(initialRoles, platform);
  if (catalog?.platform !== platform || !Array.isArray(catalog.pairs) || !catalog.pairs.length) return null;
  const available = new Set(catalog.pairs.map(pair => pairKey(pair.model, pair.effort)));
  let selectedRole = 0;
  while (true) {
    const labels = ROLES.map((role, index) => {
      const value = roles[role], missing = !available.has(pairKey(value.model, value[field]));
      return `${names[index]}: ${short(value.model)} / ${short(value[field], 8)}${missing ? ' !' : ''}`;
    });
    const selected = await ui.menu('Custom preset', [...labels, 'Done'], { selected: selectedRole, backRow: true, separatorBefore: labels.length, info: state => { const role = ROLES[state.selected]; return role ? details(roles[role].model, roles[role][field], state) : []; } });
    if (selected === null) return null;
    if (selected === ROLES.length) {
      try { assertCatalogRoles({ platform, roles, catalog }); return roles; }
      catch { await ui.page('Custom preset unavailable', ['Select an available model and effort for each role.']); continue; }
    }
    if (!ROLES[selected]) continue;
    selectedRole = selected;
    const role = ROLES[selected], current = roles[role], initial = catalog.pairs.findIndex(pair => pairKey(pair.model, pair.effort) === pairKey(current.model, current[field]));
    const excluded = Array.isArray(catalog.unavailable) ? catalog.unavailable.filter(item => typeof item?.model === 'string' && typeof item.reason === 'string') : [];
    const rows = [...catalog.pairs.map(pair => `${short(pair.model)} / ${short(pair.effort, 8)}`), ...(excluded.length ? ['Unavailable models'] : [])];
    while (true) {
      const choice = await ui.menu(`Select model — ${names[selected]}`, rows, {
        selected: Math.max(0, initial), backRow: true,
        info: state => {
          const pair = catalog.pairs[state.selected];
          return [...(initial < 0 ? ['Current model and effort are unavailable.'] : []), ...(pair ? details(pair.model, pair.effort, state) : [])];
        },
      });
      if (choice === null) break;
      if (choice === catalog.pairs.length && excluded.length) {
        await ui.page('Unavailable models', excluded.map(item => `${escapeTerminalText(item.model)}: ${escapeTerminalText(item.reason)}`));
        continue;
      }
      if (catalog.pairs[choice]) { roles[role] = { model: catalog.pairs[choice].model, [field]: catalog.pairs[choice].effort }; break; }
    }
  }
}
