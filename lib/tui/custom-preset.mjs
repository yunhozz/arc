import { loadStaticModelCatalog } from '../models/static-catalog.mjs';
import { escapeTerminalText, wrapDetailRows } from './render.mjs';
import { DEFAULT_INSTALLER_REGISTRY, platformLabel } from '../platforms/index.mjs';
import { REASON_TEXT, reasonDetail } from '../platforms/availability.mjs';

export function loadCustomCatalog({ platform, signal } = {}) { return loadStaticModelCatalog(platform, { signal }); }
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

function compactMenu(state, items, details, page) {
  if (state.columns < 40 || state.rows < 16) return viewportGuard(state);
  const fullDetails = details.flatMap(row => wrapDetailRows([row], state.columns));
  const compactFooter = fullDetails.length > state.rows - 9;
  const detailCapacity = Math.max(1, state.rows - (compactFooter ? 6 : 9));
  const detailPages = Math.max(1, Math.ceil(fullDetails.length / detailCapacity));
  const detailPage = Math.max(0, Math.min(page, detailPages - 1));
  const information = fullDetails.slice(detailPage * detailCapacity, (detailPage + 1) * detailCapacity);
  const capacity = Math.max(1, state.rows - information.length - (compactFooter ? 5 : 8));
  const selected = Math.max(0, Math.min(state.selected, items.length));
  const focus = Math.min(selected, Math.max(0, items.length - 1));
  const offset = Math.max(0, Math.min(focus - capacity + 1, items.length - capacity));
  const visible = items.slice(offset, offset + capacity).map(row => compactRow(row, state.columns));
  return {
    rows: [...information, `←/→: Details ${detailPage + 1}/${detailPages}`, '', ...visible, 'Back'],
    selected: selected === items.length ? information.length + visible.length + 2 : information.length + selected - offset + 2,
    position: items.length > capacity ? `${offset + 1}-${offset + visible.length}/${items.length}` : null,
    compactFooter, detailPage, detailPages,
  };
}

function detailPager() {
  let selection, page = 0, pages = 1, active = false;
  return {
    render(state, items, details) {
      if (selection !== state.selected) { selection = state.selected; page = 0; }
      const body = compactMenu(state, items, details, page);
      active = Number.isInteger(body.detailPages); pages = body.detailPages ?? 1; page = body.detailPage ?? 0;
      return body;
    },
    reset() { active = false; page = 0; pages = 1; },
    move({ direction }) { if (active) page = Math.max(0, Math.min(pages - 1, page + (direction === 'right' ? 1 : -1))); },
  };
}

export async function selectCatalogPair({ ui, catalog, current, roleName }) {
  const models = [...new Set(catalog.pairs.map(pair => pair.model))];
    const excluded = Array.isArray(catalog.unavailable) ? catalog.unavailable.filter(item => typeof item?.model === 'string' && typeof item.reason === 'string') : [];
    const rows = [...models, ...(excluded.length ? ['Unavailable models'] : [])];
    while (true) {
      const modelPager = detailPager();
      const info = state => {
        const model = models[state.selected];
        return details(model ?? '-', model ? catalog.pairs.filter(pair => pair.model === model).map(pair => pair.effort).join(', ') : '-', state);
      };
      const renderModelMenu = state => {
        const model = models[state.selected], compactDetails = [
          `Model: ${model ?? '-'}`,
          `Effort: ${model ? catalog.pairs.filter(pair => pair.model === model).map(pair => pair.effort).join(', ') : '-'}`,
        ];
        if (state.columns < 40 || state.rows < 24) return modelPager.render(state, rows, compactDetails);
        const guarded = detailGuard(info)(state);
        if (guarded) return modelPager.render(state, rows, compactDetails);
        const information = wrapDetailRows(info(state), state.columns), items = [...rows, 'Back'], display = [], starts = [], lengths = [];
        for (let index = 0; index < items.length; index++) {
          starts[index] = display.length;
          const block = wrapDetailRows([items[index]], state.columns);
          lengths[index] = block.length;
          display.push(...block);
        }
        const selected = Math.max(0, Math.min(state.selected, items.length - 1)), commonCapacity = Math.max(1, state.rows - information.length - 5), positionNeeded = rows.length + 1 > commonCapacity, reservedRows = positionNeeded ? 5 : 4, requiredRows = information.length + lengths[selected] + reservedRows;
        if (state.rows < requiredRows) return modelPager.render(state, rows, compactDetails);
        const capacity = Math.max(1, state.rows - information.length - reservedRows), maxOffset = Math.max(0, display.length - capacity);
        const offset = Math.max(0, Math.min(maxOffset, starts[selected] + lengths[selected] - capacity));
        modelPager.reset();
        return { rows: [...information, ...display.slice(offset, offset + capacity)], selected: information.length + starts[selected] - offset };
      };
      const choice = await ui.menu(`Model — ${roleName}`, rows, {
        selected: Math.max(0, models.indexOf(current.model)), backRow: true, info,
        renderBody: renderModelMenu, onHorizontal: modelPager.move,
      });
      if (choice === null) return null;
      if (choice === models.length && excluded.length) {
        await ui.page('Unavailable models', excluded.map(item => `${escapeTerminalText(item.model)}: ${escapeTerminalText(item.reason)}`));
        continue;
      }
      if (models[choice]) {
        const model=models[choice], efforts=[...new Set(catalog.pairs.filter(pair=>pair.model===model).map(pair=>pair.effort))];
        const effortInfo=state=>details(model,efforts[state.selected]??'-',state);
        const effortPager=detailPager();
        const renderEffortMenu=state=>{
          if(state.columns<40||state.rows<24||detailGuard(effortInfo)(state)||efforts.some(value=>wrapDetailRows([value],state.columns).length>1))return effortPager.render(state,efforts,[`Model: ${model}`,`Effort: ${efforts[state.selected]??'-'}`]);
          effortPager.reset();
        };
        const effort=await ui.menu(`Effort — ${roleName}`,efforts,{selected:Math.max(0,efforts.indexOf(current.effort)),backRow:true,info:effortInfo,renderBody:renderEffortMenu,onHorizontal:effortPager.move});
        if(effort!==null&&efforts[effort])return {model,effort:efforts[effort]};
      }
    }
}

export async function selectPlatform({ui, roleName, current, availabilityOf, registry = DEFAULT_INSTALLER_REGISTRY}) {
  const ids = registry.byDisplayOrder().map(descriptor => descriptor.runtime.id);
  let selected = Math.max(0, ids.indexOf(current));
  while (true) {
    const availability = ids.map(id => availabilityOf(id));
    const rows = ids.map((id, index) => platformLabel(id, registry) + (availability[index].selectable ? '' : ` - Unavailable  (${REASON_TEXT[availability[index].reason]})`));
    const info = state => {
      const id = ids[state.selected], value = availability[state.selected];
      const detail = id ? reasonDetail(id, value, undefined, registry) : '';
      return detail ? [compactRow(detail, state.columns)] : [];
    };
    const choice = await ui.menu(`Platform — ${roleName}`, rows, {
      selected, backRow: true, info,
      renderBody: state => {
        const information = info(state), items = [...rows, 'Back'];
        const capacity = Math.max(1, state.rows - information.length - 5);
        const offset = Math.max(0, Math.min(state.selected - capacity + 1, items.length - capacity));
        return {rows: [...information, ...items.slice(offset, offset + capacity).map(row => compactRow(row, state.columns))], selected: information.length + state.selected - offset, position: items.length > capacity ? `${offset + 1}-${Math.min(items.length, offset + capacity)}/${items.length}` : null};
      },
    });
    if (choice === null) return null;
    selected = choice;
    if (availability[choice]?.selectable) return ids[choice];
  }
}

export async function editRole({ui, roleName, current, availabilityOf, loadCatalog, defaultsFor, registry = DEFAULT_INSTALLER_REGISTRY}) {
  const value = {...current}, reset = {model: false, effort: false};
  const ids = registry.byDisplayOrder().map(descriptor => descriptor.runtime.id);
  const availability = new Map(ids.map(id => [id, availabilityOf(id)]));
  const catalogs = new Map(), defaults = new Map();
  // Horizontal handlers are synchronous; prepare their catalogs before opening the menu.
  for (const id of ids) {
    const state = availability.get(id);
    if (state.reason === 'catalog_error' || (id !== current.platform && !state.selectable)) continue;
    const loaded = await loadCatalog(id);
    catalogs.set(id, loaded?.catalog ?? loaded);
    if (state.selectable) defaults.set(id, await defaultsFor(id, roleName));
  }
  const pairs = () => catalogs.get(value.platform)?.pairs ?? [];
  const changePlatform = id => {
    if (id === value.platform) return;
    const catalog = catalogs.get(id), preferred = defaults.get(id);
    const pair = catalog?.pairs?.find(pair => pair.model === preferred?.model && pair.effort === preferred?.effort) ?? catalog?.pairs?.[0];
    value.platform = id;
    if (pair) {value.model = pair.model; value.effort = pair.effort;}
    reset.model = true; reset.effort = true;
  };
  const cycle = (items, current, direction) => {
    const index = items.indexOf(current), step = direction === 'right' ? 1 : -1;
    return items.length ? items[index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length] : current;
  };
  const onHorizontal = ({selected, direction}) => {
    if (selected === 0) {
      const start = ids.indexOf(value.platform), step = direction === 'right' ? 1 : -1;
      for (let distance = 1; distance <= ids.length; distance++) {
        const id = ids[(start + step * distance + ids.length) % ids.length];
        if (availability.get(id).selectable) {changePlatform(id); break;}
      }
    } else if (availability.get(value.platform)?.reason !== 'catalog_error') {
      if (selected === 1) {
        const model = cycle([...new Set(pairs().map(pair => pair.model))], value.model, direction);
        if (model === value.model) return;
        value.model = model; reset.model = false;
        const efforts = pairs().filter(pair => pair.model === model).map(pair => pair.effort);
        if (!efforts.includes(value.effort)) {value.effort = efforts[0]; reset.effort = true;}
      } else if (selected === 2) {
        const effort = cycle([...new Set(pairs().filter(pair => pair.model === value.model).map(pair => pair.effort))], value.effort, direction);
        if (effort !== value.effort) {value.effort = effort; reset.effort = false;}
      }
    }
  };
  const editorRows = ({columns = 80} = {}) => {
    const state = availability.get(value.platform), label = platformLabel(value.platform, registry);
    const platform = label + (state?.selectable ? '' : ` - Unavailable (${REASON_TEXT[state?.reason]})`);
    return [['Platform', platform], ['Model', value.model], ['Effort', value.effort]].map(([field, text]) =>
      (columns < 40 ? `${field}: ${escapeTerminalText(text)}` : `${field} ‹ ${escapeTerminalText(text)} ›`) + (reset[field.toLowerCase()] ? ' (reset)' : '')
    ).concat('Done', 'Back');
  };
  let selected = 0;
  while (true) {
    const info = () => {
      const detail = reasonDetail(value.platform, availability.get(value.platform), undefined, registry);
      return availability.get(value.platform)?.warning === 'auth_unverified' && detail ? [detail] : [];
    };
    const choice = await ui.menu(roleName, editorRows().slice(0, -1), {
      selected, backRow: true, onHorizontal, info,
      renderBody: state => ({rows: [...info(), ...editorRows(state)].map(row => compactRow(row, state.columns)), selected: info().length + state.selected, position: null}),
    });
    if (choice === null) return null;
    selected = choice;
    if (choice === 3) return value;
    if (choice === 0) {
      const id = await selectPlatform({ui, roleName, current: value.platform, availabilityOf, registry});
      if (id !== null) changePlatform(id);
    } else if ((choice === 1 || choice === 2) && availability.get(value.platform)?.reason !== 'catalog_error' && pairs().length) {
      const pair = await selectCatalogPair({ui, roleName, current: value, catalog: catalogs.get(value.platform)});
      if (pair) {
        if (pair.model !== value.model) reset.model = false;
        if (pair.effort !== value.effort) reset.effort = false;
        Object.assign(value, pair);
      }
    }
  }
}
