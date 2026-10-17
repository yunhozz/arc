export function renderCompletion(shell){
 if(shell==='bash')return `_arc() {
 local cur="\${COMP_WORDS[COMP_CWORD]}" prev="\${COMP_WORDS[COMP_CWORD-1]}" choices=""
 case "$prev" in
  --target) choices="claude codex all" ;;
  --preset) [[ \${COMP_WORDS[1]} == install ]] && choices="economy balanced smart" ;;
  *)
   if (( COMP_CWORD == 1 )); then choices="install uninstall completion"
   else
    case "\${COMP_WORDS[1]}" in
     install) choices="--target --preset --max-total-subagents --max-concurrent-subagents --check --dry-run --skip-global --help --version" ;;
     uninstall) choices="--target --dry-run --skip-global --help --version" ;;
     completion) (( COMP_CWORD == 2 )) && choices="zsh bash" ;;
    esac
   fi ;;
 esac
 COMPREPLY=( $(compgen -W "$choices" -- "$cur") )
}
complete -F _arc arc
`;
 if(shell==='zsh')return `_arc() {
 local -a candidates
 if (( CURRENT == 2 )); then
  candidates=(install uninstall completion)
 else
  case "\${words[CURRENT-1]}" in
   --target) candidates=(claude codex all) ;;
   --preset) [[ \${words[2]} == install ]] && candidates=(economy balanced smart) ;;
   *) case "\${words[2]}" in
    install) candidates=(--target --preset --max-total-subagents --max-concurrent-subagents --check --dry-run --skip-global --help --version) ;;
    uninstall) candidates=(--target --dry-run --skip-global --help --version) ;;
    completion) (( CURRENT == 3 )) && candidates=(zsh bash) ;;
   esac ;;
  esac
 fi
 compadd -a candidates
}
if (( ! $+functions[compdef] )); then
 autoload -Uz compinit
 compinit -D
fi
compdef _arc arc
`;
 throw new Error('Unsupported completion shell');
}
