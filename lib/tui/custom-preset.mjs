import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROLES, effortField, validateRoles } from '../models/config.mjs';
import { assertCatalogRoles, discoverModelCatalog, listCodexModelCapabilities } from '../models/catalog.mjs';
import { escapeTerminalText, wrapDetailRows } from './render.mjs';
import { resolveTarget } from '../installer/targets.mjs';
import { presetPreviewRows } from './setup.mjs';

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
  return [...wrapDetailRows([`Model: ${model}`], columns), ...wrapDetailRows([`Effort: ${effort}`], columns)];
}

function detailGuard(info) {
  return state => {
    const requiredRows = wrapDetailRows(info(state), state.columns).length + 6;
    return state.rows < requiredRows ? { rows: [`Menu requires ${requiredRows} rows at ${state.columns} columns.`], selected: undefined } : undefined;
  };
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
    const selected = await ui.menu('Custom preset', [...labels, 'Done'], { selected: selectedRole, backRow: true, separatorBefore: labels.length, refreshMs:600, renderBody:({selected,blink,columns,rows})=>{
      const values=ROLES.map((role,index)=>({role:names[index]+(!available.has(pairKey(roles[role].model,roles[role][field]))?' !':''),model:roles[role].model,effort:roles[role][field]}));
      const diagram=presetPreviewRows(values,{columns,rows,selectedRole:selected<ROLES.length?selected:undefined,blink});
      const body=[...diagram,'','Done','Back'];
      return {rows:body,selected:diagram.length===1?undefined:selected<3?1:selected<5?9:selected===5?diagram.length+1:diagram.length+2,showSelection:selected>=ROLES.length};
    }});
    if (selected === null) return null;
    if (selected === ROLES.length) {
      try { assertCatalogRoles({ platform, roles, catalog }); return roles; }
      catch { await ui.page('Custom preset unavailable', ['Select an available model and effort for each role.']); continue; }
    }
    if (!ROLES[selected]) continue;
    selectedRole = selected;
    const role = ROLES[selected], current = roles[role], initial = catalog.pairs.findIndex(pair => pairKey(pair.model, pair.effort) === pairKey(current.model, current[field]));
    const models = [...new Set(catalog.pairs.map(pair => pair.model))];
    const excluded = Array.isArray(catalog.unavailable) ? catalog.unavailable.filter(item => typeof item?.model === 'string' && typeof item.reason === 'string') : [];
    const rows = [...models.map(model=>short(model)), ...(excluded.length ? ['Unavailable models'] : [])];
    while (true) {
      const info = state => {
        const model = models[state.selected];
        return [...(initial < 0 ? ['Current model and effort are unavailable.'] : []), ...(model ? details(model, catalog.pairs.filter(pair => pair.model === model).map(pair => pair.effort).join(', '), state) : [])];
      };
      const choice = await ui.menu(`Select model — ${names[selected]}`, rows, {
        selected: Math.max(0, models.indexOf(current.model)), backRow: true, info,
        renderBody: detailGuard(info),
      });
      if (choice === null) break;
      if (choice === models.length && excluded.length) {
        await ui.page('Unavailable models', excluded.map(item => `${escapeTerminalText(item.model)}: ${escapeTerminalText(item.reason)}`));
        continue;
      }
      if (models[choice]) {
        const model=models[choice], efforts=[...new Set(catalog.pairs.filter(pair=>pair.model===model).map(pair=>pair.effort))];
        const effortInfo=state=>details(model,efforts[state.selected]??'',state);
        const effort=await ui.menu(`Select effort — ${names[selected]}`,efforts,{selected:Math.max(0,efforts.indexOf(current[field])),backRow:true,info:effortInfo,renderBody:detailGuard(effortInfo)});
        if(effort!==null&&efforts[effort]){roles[role]={model,[field]:efforts[effort]};break;}
      }
    }
  }
}
