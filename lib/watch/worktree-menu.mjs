import {DEFAULT_PLATFORM_REGISTRY} from '../runtime/platform-registry.mjs';
import {createTuiInterface} from '../tui/interface.mjs';
import {cellWidth, fitChoiceRow} from '../tui/render.mjs';
import {createTerminalSession} from '../tui/terminal.mjs';
import {WATCH_LIMITS as L} from './model.mjs';
import {sanitizeText} from './policy.mjs';
import {orderWorktrees, sameWorktree, worktreeBranch, worktreeDisplayPath} from './scope.mjs';

const columns = text => [...text].reduce((sum,character)=>sum+cellWidth(character),0);
const pad = (text,width) => text+' '.repeat(Math.max(0,width-columns(text)));

export function worktreeMenuRows(shown, groups, {
  mainRoot,currentRoot,home,now,width=80,color,registry=DEFAULT_PLATFORM_REGISTRY,
}) {
  const platforms = registry.byDisplayOrder().filter(row=>row.capabilities.watch.state==='verified');
  const rows = shown.map(tree => {
    const group = groups.get(tree.root);
    const prefix = (sameWorktree(tree.root,currentRoot) ? 'here · ' : '')+(tree.locked ? 'locked · ' : '');
    const branch = sanitizeText(worktreeBranch(tree));
    if (!group) return {branch,activity:prefix+(color ? 'no recent activity' : '(no recent activity)'),tone:color ? 'dim' : undefined};
    const elapsed = Math.max(0,now-group.lastActivity);
    const relative = elapsed<60000 ? Math.floor(elapsed/1000)+'s' : Math.floor(elapsed/60000)+'m';
    const names = platforms.filter(row=>group.platforms.has(row.id)).map(row=>row.label.toUpperCase()).join(', ');
    const activity = prefix+(elapsed<=L.spinnerIdleMs ? '● ' : '')+`${relative} ago · ${group.sessions} session${group.sessions===1?'':'s'}`+
      (names ? ' · '+names : '');
    return {branch,activity};
  });
  const available = Math.max(0,width-7);
  const naturalBranch = Math.max(0,...rows.map(row=>columns(row.branch)));
  const naturalPath = Math.max(0,...shown.map(tree=>columns(worktreeDisplayPath(tree.root,{mainRoot,home}))));
  const activityWidth = Math.max(0,...rows.map(row=>columns(row.activity)));
  const pathBudget = Math.min(naturalPath,Math.max(12,available-naturalBranch-activityWidth));
  const locations = shown.map(tree=>worktreeDisplayPath(tree.root,{mainRoot,home,width:pathBudget}));
  // Align with the TUI's conservative cell widths when a path contains an ellipsis.
  const pathWidth = Math.max(pathBudget,...locations.map(columns));
  const branchWidth = Math.min(naturalBranch,Math.max(8,available-pathWidth-activityWidth));
  return {rows:rows.map(({branch,activity},index)=>{
    const location = locations[index];
    return fitChoiceRow(pad(location,pathWidth)+'  '+pad(fitChoiceRow(branch,branchWidth+3),branchWidth)+'  '+activity,width);
  }),tones:rows.map(row=>row.tone)};
}

export async function chooseWatchWorktree({
  input,output,env=process.env,signals,worktrees,groups,mainRoot,currentRoot,home,now,
  color=env.NO_COLOR===undefined && env.TERM!=='dumb',registry,createSession=createTerminalSession,
}) {
  const {shown,hidden} = orderWorktrees(worktrees,groups,{currentRoot,mainRoot,home});
  if (!shown.length) return null;
  const session = createSession({input,output,env,signals});
  try {
    const ui = createTuiInterface(session,{input});
    const {rows,tones} = worktreeMenuRows(shown,groups,{mainRoot,currentRoot,home,now,width:session.viewport().columns,color,registry});
    const selected = await ui.menu('Which worktree to watch?',rows,{
      backRow:true,backLabel:'exit',fitRows:true,
      rowTones:tones,info:hidden ? [`${hidden} more worktrees not shown. Run arc watch inside a worktree to watch it.`] : [],
    });
    return selected===null ? null : shown[selected].root;
  } catch (error) {
    if (error.code==='ARC_TUI_EOF') return null;
    throw error;
  } finally {
    session.dispose();
  }
}
