import {createTuiInterface} from '../tui/interface.mjs';
import {createTerminalSession} from '../tui/terminal.mjs';

export function watchMenuRows(registry) {
  const all = {label:'All',platforms:[]};
  const rows = registry.byDisplayOrder().map(({id,label,capabilities}) => {
    if (capabilities.watch.state !== 'verified') {
      return {label:label+'  (not supported)',platforms:null};
    }
    all.platforms.push(id);
    return {label,platforms:[id]};
  });
  return [all,...rows];
}

export async function chooseWatchPlatforms({input,output,env,signals,registry,createSession=createTerminalSession}) {
  const rows = watchMenuRows(registry);
  const labels = rows.map(row => row.label);
  const session = createSession({input,output,env,signals});
  try {
    const ui = createTuiInterface(session,{input});
    let selected = 0, notice = [];
    for (;;) {
      const previous = selected;
      selected = await ui.menu('Which platform to watch?',labels,{
        selected,backRow:true,backLabel:'exit',
        notice:({selected:current})=>{
          if (current !== previous) notice = [];
          return notice;
        },
      });
      if (selected === null) return null;
      const row = rows[selected];
      if (row.platforms !== null) return row.platforms;
      notice = [row.label.slice(0,-'  (not supported)'.length)+' is not supported by arc watch.'];
    }
  } catch (error) {
    if (error.code === 'ARC_TUI_EOF') return null;
    throw error;
  } finally {
    session.dispose();
  }
}
