export function renderCompletion(shell){
 if(shell==='bash')return `_arc() {
 local cur="\${COMP_WORDS[COMP_CWORD]}" prev="\${COMP_WORDS[COMP_CWORD-1]}" command="\${COMP_WORDS[1]}" choices=""
 case "$prev" in
  --target) choices="claude codex all" ;;
  --preset) choices="economy balanced smart" ;;
  --language) choices="en ko" ;;
  *)
   if (( COMP_CWORD == 1 )) && [[ $cur != -* ]]; then choices="preset uninstall"
   else
    case "$command" in
     preset)
      if (( COMP_CWORD == 2 )) && [[ $cur != -* ]]; then choices="economy balanced smart"
      else choices="--target --check --dry-run --help"; fi ;;
     uninstall) choices="--target --dry-run --skip-global --help --version" ;;
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
  candidates=(preset uninstall)
 else
  case "\${words[CURRENT-1]}" in
   --target) candidates=(claude codex all) ;;
   --preset) candidates=(economy balanced smart) ;;
   --language) candidates=(en ko) ;;
   *) case "\${words[2]}" in
    preset)
     if (( CURRENT == 3 )) && [[ \${words[CURRENT]} != -* ]]; then candidates=(economy balanced smart)
     else candidates=(--target --check --dry-run --help); fi ;;
    uninstall) candidates=(--target --dry-run --skip-global --help --version) ;;
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
