# 팀장 잔여 코드 제거 구현 계획

> **작업자 안내:** 구현은 승인된 범위에서 Coder가 맡고 CEO가 순차적으로 조율한다. ARC 지침에 따라 별도의 실행 방식 선택이나 작업별 리뷰 gate를 추가하지 않는다.

**목표:** 활성 코드, README, 테스트 소스에서 Lead 모델 호환성과 구형 프로필 퇴역 처리를 제거하고, 여섯 역할만 관리한다.

**구조:** 모델 loader는 정확히 여섯 역할 설정만 허용한다. 설치기는 여섯 프로필과 외부 스킬만 백업·교체하고 추가 프로필에는 접근하지 않는다. 과거 spec과 plan은 보존한다.

**기술:** Python 3.11 이상, TOML, SHA-256 manifest.

**Spec:** 2026-10-05에 승인된 bounded 인채팅 설계 (별도 spec 파일 없음). 기존 `docs/superpowers/specs/2026-10-05-ceo-development-owner-design.md`는 전환 처리의 역사 기록으로 보존한다.

## 전체 제약

- 작업 공간: `/Users/yunho/Desktop/project/arc`; 사용자가 현재 `master`에서 진행하도록 지정했다.
- 제품 변경 파일: `install.py`, `skill/scripts/model_config.py`, `README.md`, `tests/test_install.py`, `MANIFEST.sha256`.
- `docs/`의 과거 spec·plan·brief는 보존한다.
- 설치된 `CODEX_HOME`을 직접 변경하거나 설치를 실행하지 않는다.
- 사용자가 커밋을 요청하지 않았으므로 변경을 커밋하지 않는다.
- 사용자가 직접 승인한 예외: TDD 테스트를 생략한다. 새 테스트를 추가하거나 어떤 테스트도 실행하지 않는다.
- Coder는 편집 전에 TDD 필수 단계를 보고하고 멈췄다. CEO는 아래 결정과 사용자 승인을 기록하고 구현을 재개시킨다.
- 기존 테스트 파일에서 폐기되는 동작만 설명하는 코드를 제거한다. 대체 테스트를 만들지 않는다.
- 외부 스킬의 `.agents/skills` 호환성은 유지한다. `legacy`라는 단어 자체를 제거 대상으로 보지 않는다.
- 일반 백업·staging·rollback·recovery 보호 로직을 유지한다.
- 모델 loader 및 설치기 계약을 변경하므로, 구현 뒤 QA 구조 검증과 독립 Reviewer의 전체 변경 검토를 순서대로 수행한다.

## 리뷰 중점

사용자가 테스트 작성을 명시적으로 생략시켰으므로, 다음 동작은 구조 검토만 가능하며 실행 증거는 확보하지 않는다.

**기록된 TDD 결정:** TDD 스킬의 필수 단계는 실패 테스트 작성, 예상 실패 확인, 최소 구현, 테스트 및 전체 suite 실행, 필요 시 green을 유지하며 정리하는 것이다. Coder는 이 단계를 사전 보고했다. 사용자가 직접 `TDD 생략해`라고 지시했으므로 새 테스트 작성과 모든 테스트 실행을 생략한다. 대신 승인 범위 안의 정적 참조 검사, Python AST 구문 검사, 읽기 전용 installer payload preflight, 독립 QA 구조 검사와 최종 Reviewer 검토를 수행한다. 이 대안은 실행 동작 및 회귀 안전성을 증명하지 못한다.

1. 추가 역할 설정은 오류로 거부되고 모델 적용 전에 중단되는가.
2. 추가 설치 프로필을 설치기가 검사·백업·삭제하지 않는가.
3. 구형 프로필 staging 제거 뒤 일반 설치의 backup·교체·rollback 순서가 그대로인가.
4. rollback 실패 시 기존 backup과 recovery 데이터 보존 흐름이 그대로인가.
5. 모델 적용의 종료 코드, 읽기 전용 옵션, 원본 설정 보존 동작이 코드상 유지되는가.

---

## 작업 1: 모델 loader와 관련 테스트 소스 정리

**파일**

- 수정: `skill/scripts/model_config.py:78-122`
- 수정: `tests/test_install.py:120-285`

**인터페이스**

- 유지: `load_settings(config_path: Path) -> dict[str, RoleSettings]`.
- 유지: `ROLE_FILES`의 여섯 역할과 `serialize_settings(settings) -> bytes`.
- 변경 계약: `roles` 키 집합은 정확히 `set(ROLE_FILES)`와 같아야 하며, 추가 역할은 기존 `ValidationError`로 거부한다.
- 소비자: `install.py`의 profile preflight 및 staged model config 생성, `skill/scripts/apply-models.py`의 설정 로더.

- [x] 허용 역할 검사를 정확히 여섯 키 집합 비교로 바꾸고 오류 안내에서 호환성 문구를 제거한다.
- [x] 검증된 각 역할을 결과에 추가하고 전용 필터·stderr 안내 및 쓰이지 않는 `sys` import를 제거한다. version, 필드, 문자열 검증과 직렬화는 보존한다.
- [x] `test_model_legacy_preserves_six_selections`와 `test_model_legacy_lead_requires_valid_fields`를 제거한다. 추가·누락된 역할을 거부하는 기존 일반 사례는 유지한다.
- [x] apply-models fixture의 호환성 옵션과 구형 파일 생성 로직을 제거하고 표준 여섯 역할 사례만 남긴다. 기존 테스트 본문에서 설정 보존, 읽기 전용 동작, 종료 코드, 재실행 검증을 삭제하지 않는다.
- [x] `test_apply_models_check_standard_and_legacy_without_lead_profile`, `test_apply_models_dry_run_preserves_config_profiles_and_stale_lead`, `test_apply_models_applies_six_profiles_without_mutating_config_or_stale_lead`를 표준 설정 사례로 축소하고 이름에서 구형 호환성 표현을 제거한다.
- [x] CEO 개발 소유권 assertion 중 제거 대상 식별자를 포함한 부정 assertion만 제거한다.
- [x] diff를 읽어 인터페이스 및 fixture 호출을 정적으로 확인한다. 테스트는 추가·실행하지 않는다.

## 작업 2: 설치기의 구형 프로필 퇴역 처리 제거

**파일**

- 수정: `install.py:29-38, 837-872, 888-913, 970-1015, 1121-1129`
- 수정: `tests/test_install.py:656-894`

**인터페이스**

- 제거: `RETIRED_PROFILE_FILES`, `retired_profile_targets(home)`.
- 변경: `backup_existing(arc_target, profile_targets, backup_root, external_targets)`는 활성 profile target만 백업한다.
- 유지: `install_plan()` 반환값과 `_transactional_install()` 인자·반환값.
- 내부 타입 변경: `staged_targets`의 모든 staged 경로는 실제 교체 대상이며 `None` 삭제 staging이 없다.
- 의존성: 작업 1의 엄격한 여섯 역할 loader.

- [x] 퇴역 profile 상수와 helper를 제거한다.
- [x] `install_plan()`의 구형 profile 경로 검사와 `backup_existing()`의 구형 target 인자를 제거한다.
- [x] transaction의 퇴역 target 확인·백업 전달·삭제 전용 staging을 제거한다. staged 교체 journal, 일반 rollback 및 recovery 동작을 보존한다.
- [x] 삭제 staging이 없어졌으므로 타입을 구체화하고 삭제를 위한 `None` 분기만 제거한다. 설치 대상을 교체하는 순서와 예외 복구는 변경하지 않는다.
- [x] dry-run 출력에서 구형 profile 퇴역 안내를 제거한다.
- [x] 퇴역 동작만 검증하는 fixture, 테스트와 정규화 사례를 제거한다. 일반 설치·외부 스킬·rollback 테스트는 삭제하지 않고 대체 테스트도 추가하지 않는다.
- [x] 변경 diff에서 `backup_existing()` 호출 인자와 staged target journal을 정적으로 확인한다. 테스트는 실행하지 않는다.

## 작업 3: 현재 사용 안내와 manifest 동기화

**파일**

- 수정: `README.md:88-116`
- 수정: `MANIFEST.sha256`

- [x] README의 모델 설정 설명을 정확히 여섯 역할만 허용하는 내용으로 간결화한다.
- [x] stale 구형 profile 설명, 백업 목록 항목 및 퇴역 전용 문단을 제거한다.
- [x] 일반 transaction 설명은 외부 스킬·ARC·활성 profile 교체와 rollback 중심으로 유지한다.
- [x] 최종 `README.md`, `install.py`, `skill/scripts/model_config.py` bytes에 대한 manifest SHA-256만 갱신한다. 나머지 manifest entry를 보존한다.

## 작업 4: 최종 구조 검증과 독립 검토

**순서:** Coder 완료 후 QA가 테스트를 실행하지 않고 구조 검증을 수행하고, 이어 Reviewer가 최종 전체 diff를 독립적으로 확인한다. 사용자의 테스트 생략 지시를 두 역할에 전달한다.

- [x] 변경 파일 범위와 patch 공백 오류를 확인한다.

```sh
git diff --name-only
git diff --check
```

예상: 제품 변경은 위 다섯 파일에 한정되고, `git diff --check`는 오류 없이 끝난다. 본 계획 문서는 별도의 계획 산출물이다.

- [x] 활성 코드·README·테스트에서 구형 역할명 및 퇴역 전용 식별자 잔존 여부를 검색한다. `docs/`의 과거 spec·plan은 제외한다.

```sh
rg -n -i 'yunho[_-]team[_-]lead|team.?lead|팀장|RETIRED_PROFILE_FILES|retired_profile_targets|retired_targets|test_retired_|retired_fixture' install.py skill agents README.md tests
```

예상: 일치 없음, 종료 코드 1.

- [x] 변경 Python 파일은 import 없이 AST 파싱으로 구문만 확인한다.

```sh
python3 -B - <<'PY'
import ast
from pathlib import Path

for name in ("install.py", "skill/scripts/model_config.py", "tests/test_install.py"):
    path = Path(name)
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
print("Python syntax check passed.")
PY
```

- [x] 읽기 전용 payload 사전 검사를 수행해 manifest와 현재 환경에서 확인 가능한 profile·path 계약을 확인한다.

```sh
python3 -B install.py --check
```

예상: 종료 코드 0. 필수 외부 스킬 부재 등 현재 환경에 따른 실패가 있으면 정확한 오류와 검증 공백을 보고하고 실제 설치로 우회하지 않는다.

- [x] Reviewer가 `backup_existing()` 호출, 설치 transaction, README와 코드의 계약 일치, 일반 rollback/recovery 보호 로직 유지, 계획된 다섯 파일 외 diff 여부를 확인한다.
- [x] 완료 보고에 테스트를 추가·실행하지 않았음을 명시하고, 구조 검증 결과와 테스트 생략에 따른 동작 검증 공백을 함께 기록한다.

## 수락 기준과 위험

- 활성 코드·README·테스트 소스에서 구형 역할 및 퇴역 전용 처리가 사라진다. 과거 문서는 그대로 보존한다.
- loader는 여섯 역할만 허용하며 추가 역할은 기존 validation error로 거부한다.
- 새 설치/업데이트 과정은 여섯 profile만 관리한다. 이전 설치에 남아 있는 추가 profile은 검사·백업·삭제되지 않는다.
- 예전 확장 설정은 새 loader에서 거부된다. 설치기는 기존 사용자 선택을 자동 병합하지 않는다.
- manifest, Python 구문, 활성 참조 구조 검사를 수행한다. 동작 테스트 실행은 사용자 지시에 따라 생략한다.
- 테스트 부재 때문에 설정 적용과 transaction failure/rollback 동작의 회귀 여부를 실행으로 증명할 수 없다. 구조 검토는 이를 완전히 대체하지 않는다.

## 계획 자체 검토

- 승인 설계의 다섯 제품 파일, 과거 문서 보존, `master` 사용, 테스트 생략을 반영했다.
- model loader 선행 작업과 installer 의존성, `backup_existing()` 인자, 삭제 staging 타입 제거를 연결했다.
- 외부 스킬의 별도 legacy 호환성 및 일반 transaction 보호 테스트를 보존하도록 명시했다.
- 동작 회귀 검증은 테스트 생략 지시 때문에 미해결 위험으로 남기고, 정적 검사 결과와 분리해 보고한다.
