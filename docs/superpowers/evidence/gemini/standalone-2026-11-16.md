# Gemini capability evidence: standalone

- capability: standalone
- gemini version: 0.68.0 (`gemini --version` output: `0.68.0`)
- os / host: darwin 25.6.0 / claude-cli
- ARC commit: ef514e7
- 실행 명령: (secrets removed; `<H>` is a fresh temporary HOME whose `.gemini/settings.json` contains only `{"security":{"auth":{"selectedType":"gemini-api-key"}}}`; `GEMINI_API_KEY` supplied through the environment; `<W>` is a scratch working directory containing `token.txt` = `L4-TOKEN-9c2e`)
  1. Install: `node l4-driver.mjs <repo> <H> install` — calls `prepareOperation`/`executeOperation` from `lib/management/operations.mjs` with `{kind:'install', target:'gemini', language:'en'}` and an injected registry equal to the operational one except Gemini `standalone` verified (prerequisites `install`, `nativeProfile`, `catalog` are already verified operationally).
  2. Delegation: in `<W>`, `HOME=<H> GEMINI_CLI_TRUST_WORKSPACE=true gemini -m gemini-3.5-flash-lite -o json -p "You are the ARC Orchestrator. Following your ARC skill, assign this bounded read-only research question to the ARC Scouter role by delegating to its native subagent (do not answer it yourself): What is the exact content of the file token.txt in the current directory? Then report the Scouter's answer."` (no `@` forcing; main model differs from the profile model on purpose).
  3. Uninstall: `node l4-driver.mjs <repo> <H> uninstall` with `{kind:'uninstall', target:'gemini', removeCli:false}`, then list `<H>/.gemini`.
- 관찰 결과:
  - Install: `{"code":0,"results":[{"platform":"gemini","status":"installed","residualPaths":[]}]}`. `<H>/.gemini/agents/arc-{implementer,planner,qa,reviewer,scouter}.md`; `arc-scouter.md` frontmatter `name: arc-scouter`, `description: Research evidence and inspect assigned static source`, `model: gemini-2.5-flash`; `GEMINI.md` has one ARC managed block.
  - Delegation (session_id `d27e1b23-9d63-4982-bc05-0ab981b2128b`, exit 0): the session log records `invoke_agent` with `agent_name: "arc-scouter"` chosen by the main agent; tool calls `invoke_agent` 1, `read_file` 1, `complete_task` 1; response reports `L4-TOKEN-9c2e`. `stats.models`: `gemini-3.5-flash-lite` role `main`, `gemini-2.5-flash` role `subagent` (the standalone profile model). The log shows no explicit skill activation call; the delegation followed the ARC instructions loaded from `GEMINI.md` and the available `arc-*` subagents.
  - Uninstall: `{"code":0,"results":[{"platform":"gemini","status":"uninstalled","residualPaths":[]}]}`; `agents/` and `skills/` empty, `GEMINI.md` 0 bytes (shared managed-block removal behavior, as in L1).
- 판정: pass
- 실행자: Orchestrator, 2026-11-16
