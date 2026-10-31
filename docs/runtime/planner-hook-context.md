# Planner runtime 연동 범위

Codex 대상 설치·갱신 시 CLI가 감지되면 ARC는 `PreToolUse` 진단 entrypoint를 등록한다. Codex는 비관리 훅의 현재 정의를 `/hooks`에서 검토하고 신뢰하기 전에는 실행하지 않는다. 등록과 entrypoint 연결은 실제 trust나 callback 관찰의 증거가 아니다.

설치된 entrypoint는 Codex 입력을 받아 제한된 운영 metadata만 `~/.arc/state/native-diagnostics/codex.jsonl`에 기록한다. 기록은 `platform`, `event`, `callback`, `definitionHash`, `runtimeHash`, `platformVersion`, `observedAt`으로 제한되고 파일 상한은 1 MiB다. 원본 도구 입력, prompt, transcript, 환경 변수나 caller 권한 정보는 저장하지 않는다. 정상 callback은 빈 stdout으로 종료하며 정책 판정이나 identity·assignment·lease 전이를 실행하지 않는다. 진단 저장 실패도 정책 거부를 만들지 않는다.

이 훅은 Codex 호출자를 신뢰할 수 있는 역할에 연결하지 않으며 도구 호출 허용·거부나 역할별 Git 제한을 강제하지 않는다. `runCodexGate`와 `runClaudeGate`는 호출자가 제공한 trusted context를 사용하는 공통 API로 남지만, Codex 진단 훅에 연결되지 않는다. Claude Mod source의 실제 host 무결성과 자동 lifecycle은 별도 검증 전까지 완료로 표시하지 않는다.

## 기존 native 설정

Codex 설치기는 ARC 소유 정의를 기존 `config.toml`과 병합하고, 소유 기록과 현재 정의가 일치하는 경우에만 갱신·제거한다. 다른 사용자 훅과 설정은 보존한다. 정의가 변했거나 남은 참조가 모호하면 자산을 보존하고 충돌 또는 잔여 참조를 보고한다. `skipGlobal`은 전역 설정 정리를 수행하지 않는다.

Codex trust는 호스트의 `/hooks` 검토 대상이며 설치기가 관리 신뢰를 가장하거나 우회하지 않는다. ARC 상태의 callback 기록은 해당 metadata가 관찰됐다는 뜻이고 trust, 호출자 identity 또는 native policy 적용을 증명하지 않는다.

## 격리 preflight와 증거

`scripts/probe-runtime-hooks.mjs`는 명시적인 임시 scratch root, Codex CLI, `HOME`, `CODEX_HOME`, workspace를 요구한다. 허용된 대상에서 CLI의 `--version`만 실행하며 host 등록·trust·callback은 `unverified`로 보고한다. 실제 Codex host callback 확인에는 별도의 격리 세션과 현재 훅 정의의 신뢰 검토가 필요하다.

각 경로는 존재하는 절대 경로여야 한다. scratch root는 OS 임시 디렉터리나 `/tmp` 아래에서 현재 사용자가 소유하고 다른 사용자에게 열려 있지 않은 전용 디렉터리다. 세 대상 디렉터리는 그 안의 실제 경로여야 하며 CLI는 실행 가능한 파일이어야 한다.

```sh
node scripts/probe-runtime-hooks.mjs \
  --scratch-root /absolute/temporary-root \
  --cli /absolute/path/to/codex \
  --home /absolute/temporary-root/home \
  --codex-home /absolute/temporary-root/home/.codex \
  --workspace /absolute/temporary-root/workspace
```

정책 또는 runtime bytes가 바뀌면 기존 cooperative workflow의 저장된 hash가 현재 값과 달라져 `cooperative.versions`에서 보류될 수 있다. ARC는 기존 workflow나 Planner ledger의 버전을 자동으로 덮어쓰지 않는다. 단위 테스트와 임시 설치 fixture는 공통 계약과 파일 보존을 확인하며 실제 host callback이나 도구 차단의 증거가 아니다.
