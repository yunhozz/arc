export function renderCompletion(shell){
 if(shell==='bash')return `_arc() {
 local cur="\${COMP_WORDS[COMP_CWORD]}" prev="\${COMP_WORDS[COMP_CWORD-1]}" command="\${COMP_WORDS[1]}" choices=""
 case "$prev" in
  --target) [[ $command == -* || $command == preset || $command == uninstall ]] && choices="claude codex all" ;;
  --preset) [[ $command == -* ]] && choices="economy balanced smart" ;;
  --language) [[ $command == -* ]] && choices="en ko" ;;
  *)
   if (( COMP_CWORD == 1 )) && [[ $cur != -* ]]; then choices="preset uninstall completion upgrade"
   else
    case "$command" in
     preset)
      if (( COMP_CWORD == 2 )) && [[ $cur != -* ]]; then choices="economy balanced smart"
      else choices="--target --check --dry-run --help"; fi ;;
     uninstall) choices="--target --dry-run --skip-global --help --version" ;;
     upgrade) choices="--help" ;;
     completion) (( COMP_CWORD == 2 )) && choices="zsh bash" ;;
     -*) choices="--target --preset --language --max-total-subagents --max-concurrent-subagents --check --dry-run --skip-global --help --version" ;;
    esac
   fi ;;
 esac
 COMPREPLY=( $(compgen -W "$choices" -- "$cur") )
}
complete -F _arc arc
`;
 if(shell==='zsh')return `_arc() {
 local -a candidates
 if (( CURRENT == 2 )) && [[ \${words[CURRENT]} != -* ]]; then
  candidates=(preset uninstall completion upgrade)
 else
  case "\${words[CURRENT-1]}" in
   --target) [[ \${words[2]} == -* || \${words[2]} == preset || \${words[2]} == uninstall ]] && candidates=(claude codex all) ;;
   --preset) [[ \${words[2]} == -* ]] && candidates=(economy balanced smart) ;;
   --language) [[ \${words[2]} == -* ]] && candidates=(en ko) ;;
   *) case "\${words[2]}" in
    preset)
     if (( CURRENT == 3 )) && [[ \${words[CURRENT]} != -* ]]; then candidates=(economy balanced smart)
     else candidates=(--target --check --dry-run --help); fi ;;
    uninstall) candidates=(--target --dry-run --skip-global --help --version) ;;
    upgrade) candidates=(--help) ;;
    completion) (( CURRENT == 3 )) && candidates=(zsh bash) ;;
    -*) candidates=(--target --preset --language --max-total-subagents --max-concurrent-subagents --check --dry-run --skip-global --help --version) ;;
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
