# Planner runtime 연동 범위

ARC는 Codex·Claude native observer hook과 Claude Bash Git guard를 설치·갱신·삭제하지 않는다. 역할 프로필에도 ARC 관리 hook을 생성하지 않으며, hook 전용 stdin 진입점과 관찰 기록 API는 제공하지 않는다.

일반 `runCodexGate`·`runClaudeGate` API와 Git command 분류, cooperative workflow·Planner ledger·assignment·approval 검증은 유지된다. 이 API는 trusted context를 받는 호출자의 판정 기능이며, Codex·Claude host에 자동으로 연결되거나 도구 실행을 강제로 차단하지 않는다. 역할의 Git 제한과 승인·검토 계약은 계속 적용된다.

## 기존 native 설정

설치기는 일반 concurrency·wait 설정을 처리할 때 기존 hook 데이터를 사용자 설정으로 보존한다. 제거 계획은 native hook 설정을 검사하거나 수정하지 않는다. 실제 `~/.codex/config.toml`, Claude native settings, Codex `hooks.state`, 기존 `.git/arc/planner-observations` 데이터의 cleanup이나 migration은 제공하지 않는다.

따라서 기존 설정의 hook command가 남을 수 있다. 업데이트·제거 후 command가 가리키는 전용 파일이 없어지면 낡은 참조가 되며, 구버전 파일이 남은 동안에는 기존 hook이 계속 실행될 수 있다. 소스 제거를 기존 사용자 설정 정리나 현재 host callback 검증 완료로 해석하지 않는다.

## Runtime hash와 증거

정책 bytes와 hook 전용 함수 제거로 `policyHash`·`runtimeHash`가 변경된다. 이전 hash를 저장한 cooperative workflow는 기존 `cooperative.versions` 검사에서 hold할 수 있다. 저장된 versions·Planner ledger를 자동 재작성하거나 workflow를 초기화하지 않는다.

일반 adapter와 cooperative 검사는 합성 trusted context·임시 workflow에서 공유 계약의 동작을 확인한다. 배포 payload 검사는 hook 전용 자산 미포함과 공유 runtime 보존을 확인한다. 이 결과는 실제 host가 도구 호출을 중단했다는 증거가 아니다. `plannerHookContextStatus`와 capability 진단은 공유 API 소비자가 제공해야 하는 context와 검증 한계를 설명한다.
