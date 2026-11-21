import {createTuiInterface} from '../tui/interface.mjs';
import {createTerminalSession} from '../tui/terminal.mjs';

export function watchMenuRows(registry) {
  return registry.byDisplayOrder().map(({id,label,capabilities}) => ({
    id,label,supported:capabilities.watch.state === 'verified',
  }));
}

export async function chooseWatchPlatforms({input,output,env,signals,registry,createSession=createTerminalSession}) {
  const rows = watchMenuRows(registry);
  const checked = new Set(rows.filter(row => row.supported).map(row => row.id));
  const watchIndex = rows.length;
  const actionKinds = [...rows.map(() => undefined),'confirm'];
  const session = createSession({input,output,env,signals});
  try {
    const ui = createTuiInterface(session,{input});
    let selected = watchIndex, notice = [];
    for (;;) {
      const labels = rows.map(({id,label,supported}) => {
        if (!supported) return '[-] '+label+'  (not supported)';
        return (checked.has(id) ? '[x] ' : '[ ] ')+label;
      });
      labels.push('Watch');
      const previous = selected;
      selected = await ui.menu('Which platforms to watch?',labels,{
        selected,backRow:true,backLabel:'exit',hint:'checklist',actionKinds,
        notice:({selected:current})=>{
          if (current !== previous) notice = [];
          return notice;
        },
      });
      if (selected === null) return null;
      if (selected === watchIndex) {
        if (checked.size) return rows.filter(row => checked.has(row.id)).map(row => row.id);
        notice = ['Select at least one platform to watch.'];
        continue;
      }
      const row = rows[selected];
      if (!row.supported) {
        notice = [row.label+' is not supported by arc watch.'];
        continue;
      }
      if (checked.has(row.id)) checked.delete(row.id);
      else checked.add(row.id);
      notice = [];
    }
  } catch (error) {
    if (error.code === 'ARC_TUI_EOF') return null;
    throw error;
  } finally {
    session.dispose();
  }
}
