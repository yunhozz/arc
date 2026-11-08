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
  return [...wrapDetailRows([`Model: ${model}`], columns), ...wrapDetailRows([`Effort: ${effort}`], columns), ''];
}

function detailGuard(info) {
  return state => {
    const requiredRows = wrapDetailRows(info(state), state.columns).length + 6;
    return state.rows < requiredRows ? { rows: [`Menu requires ${requiredRows} rows at ${state.columns} columns.`], selected: undefined } : undefined;
  };
}

function compactRow(value, columns) {
  const lines = wrapDetailRows([value], columns);
  if (lines.length < 2) return lines[0];
  const characters = [...lines[0]];
  while (characters.length && wrapDetailRows([characters.join('') + '…'], columns).length > 1) characters.pop();
  return characters.join('') + '…';
}

function viewportGuard({ columns, rows }) {
  const availableRows = Math.max(0, rows - 1), availableColumns = columns - 3;
  const wrap = value => availableColumns === 1 ? [...value] : wrapDetailRows([value], columns);
  const full = wrap('Menu requires 40 columns and 16 rows.'), short = wrap('Requires 40x16.'), minimum = wrap('40x16');
  const guidance = full.length <= availableRows ? full : short.length <= availableRows ? short : minimum;
  return { rows: guidance.slice(0, availableRows), selected: undefined, position: null, compactFooter: rows < guidance.length + 4 };
}

function compactMenu(state, items, details) {
  if (state.columns < 40 || state.rows < 16) return viewportGuard(state);
  const information = details.map(row => compactRow(row, state.columns));
  const capacity = Math.max(1, state.rows - information.length - 7);
  const selected = Math.max(0, Math.min(state.selected, items.length));
  const focus = Math.min(selected, Math.max(0, items.length - 1));
  const offset = Math.max(0, Math.min(focus - capacity + 1, items.length - capacity));
  const visible = items.slice(offset, offset + capacity).map(row => compactRow(row, state.columns));
  return {
    rows: [...information, ...visible, '', 'Back'],
    selected: selected === items.length ? information.length + visible.length + 1 : information.length + selected - offset,
    position: items.length > capacity ? `${offset + 1}-${offset + visible.length}/${items.length}` : null,
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
    const selected = await ui.menu('Custom preset', [...labels, 'Apply'], { selected: selectedRole, backRow: true, separatorBefore: labels.length, refreshMs:600, renderBody:({selected,blink,columns,rows})=>{
      const values=ROLES.map((role,index)=>({role:names[index]+(!available.has(pairKey(roles[role].model,roles[role][field]))?' !':''),model:roles[role].model,effort:roles[role][field]}));
      const diagram=presetPreviewRows(values,{columns,rows,selectedRole:selected<ROLES.length?selected:undefined,blink});
      if(diagram.length===1){
        if(columns<40||rows<16)return viewportGuard({columns,rows});
        const summary=presetPreviewRows(values,{columns,rows,compact:true}).slice(0,ROLES.length).map(row=>compactRow(row,columns));
        return {rows:[...summary,'','Apply','Back'],selected:selected<ROLES.length?selected:selected+1,position:null};
      }
      const body=[...diagram,'','Apply','Back'];
      return {rows:body,selected:selected<3?1:selected<5?9:selected===5?diagram.length+1:diagram.length+2,showSelection:selected>=ROLES.length};
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
    const rows = [...models, ...(excluded.length ? ['Unavailable models'] : [])];
    while (true) {
      const info = state => {
        const model = models[state.selected];
        return [...(initial < 0 ? ['Current model and effort are unavailable.'] : []), ...details(model ?? '-', model ? catalog.pairs.filter(pair => pair.model === model).map(pair => pair.effort).join(', ') : '-', state)];
      };
      const renderModelMenu = state => {
        const model = models[state.selected], compactDetails = [
          ...(initial < 0 ? ['Current model and effort are unavailable.'] : []),
          `Model: ${model ?? '-'}`,
          `Effort: ${model ? catalog.pairs.filter(pair => pair.model === model).map(pair => pair.effort).join(', ') : '-'}`,
        ];
        if (state.columns < 40 || state.rows < 24) return compactMenu(state, rows, compactDetails);
        const guarded = detailGuard(info)(state);
        if (guarded) return compactMenu(state, rows, compactDetails);
        const information = wrapDetailRows(info(state), state.columns), items = [...rows, 'Back'], display = [], starts = [], lengths = [];
        for (let index = 0; index < items.length; index++) {
          if (index === rows.length) display.push('');
          starts[index] = display.length;
          const block = wrapDetailRows([items[index]], state.columns);
          lengths[index] = block.length;
          display.push(...block);
        }
        const selected = Math.max(0, Math.min(state.selected, items.length - 1)), commonCapacity = Math.max(1, state.rows - information.length - 5), positionNeeded = rows.length + 2 > commonCapacity, reservedRows = positionNeeded ? 5 : 4, requiredRows = information.length + lengths[selected] + reservedRows;
        if (state.rows < requiredRows) return compactMenu(state, rows, compactDetails);
        const capacity = Math.max(1, state.rows - information.length - reservedRows), maxOffset = Math.max(0, display.length - capacity);
        const offset = Math.max(0, Math.min(maxOffset, starts[selected] + lengths[selected] - capacity));
        return { rows: [...information, ...display.slice(offset, offset + capacity)], selected: information.length + starts[selected] - offset };
      };
      const choice = await ui.menu(`Select model — ${names[selected]}`, rows, {
        selected: Math.max(0, models.indexOf(current.model)), backRow: true, info,
        renderBody: renderModelMenu,
      });
      if (choice === null) break;
      if (choice === models.length && excluded.length) {
        await ui.page('Unavailable models', excluded.map(item => `${escapeTerminalText(item.model)}: ${escapeTerminalText(item.reason)}`));
        continue;
      }
      if (models[choice]) {
        const model=models[choice], efforts=[...new Set(catalog.pairs.filter(pair=>pair.model===model).map(pair=>pair.effort))];
        const effortInfo=state=>details(model,efforts[state.selected]??'-',state);
        const renderEffortMenu=state=>{
          if(state.columns<40||state.rows<24||detailGuard(effortInfo)(state)||efforts.some(value=>wrapDetailRows([value],state.columns).length>1))return compactMenu(state,efforts,[`Model: ${model}`,`Effort: ${efforts[state.selected]??'-'}`]);
        };
        const effort=await ui.menu(`Select effort — ${names[selected]}`,efforts,{selected:Math.max(0,efforts.indexOf(current[field])),backRow:true,info:effortInfo,renderBody:renderEffortMenu});
        if(effort!==null&&efforts[effort]){roles[role]={model,[field]:efforts[effort]};break;}
      }
    }
  }
}
