# Python 캐시 배포 제외와 0.1.8 준비 설계

**상태:** 사용자 승인 완료. 구현·검증하지 않음.

**대상:** `/Users/ma-24-007/Desktop/workspace/arc`, branch `master`, HEAD `83010c623e59a64a8ef9a7f11b20c0b70aa111e6`. Orchestrator가 재확인한 작업 상태는 clean이며, 사용자가 현재 checkout을 선택했습니다.

**설계 경로:** `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-10-22-python-cache-packaging-design.md`

**목표와 배경**

Python 실행 중 생성된 `__pycache__/*.pyc`가 npm tarball에 포함되어 발생하는 `Missing entry or hash mismatch`를 방지하고, 차기 patch `0.1.8`을 준비합니다.

현재 `package.json.files`는 디렉터리를 포함하지만, manifest generator는 `__pycache__`를 제외합니다. verifier는 보호 대상 디렉터리 내부 파일을 검사하므로 tarball에 들어간 미등록 `.pyc`를 거부합니다. Orchestrator가 확인한 registry·shasum·설치 파일 근거에 따르면 `0.1.7`은 이미 게시되었고 실제 캐시 파일을 포함합니다.

**접근 방식과 선택 제안**

| 접근 | 장점 | 비용·제약 |
|---|---|---|
| **`files` negative glob 추가 — 권고** | 포함 대상 전체에서 캐시 제외. verifier 변경 없이 적용 | release 입력 해석기에 정확한 두 규칙 허용 필요 |
| scripts 하위 `.npmignore` 추가 | npm의 하위 디렉터리 제외 기능 사용 | `.npmignore` 자체의 tarball 누락을 generator·verifier에서 처리해야 하며 적용 위치가 제한됨 |
| 깨끗한 source만 사용하도록 운영 | 소스 수정 최소화 | 직접 npm 포장 시 캐시 재유입 방지 장치가 남지 않음 |

권고안은 첫 번째입니다. 사용자가 선택한 bounded 범위 안에서 포장 규칙과 기존 release 경로를 함께 맞춥니다. 이 구체적인 방식은 본 설계 승인 대상으로 제안합니다.

**제안 동작**

`package.json.files`의 기존 포함 항목 뒤에 다음 두 제외 항목을 추가합니다.

```json
"!**/__pycache__/**",
"!**/*.pyc"
```

`lib/release/artifact.mjs`의 `inputNames`는 위 두 문자열만 정확히 인식하여 입력 루트 수집에서 건너뜁니다. 다른 glob과 지원하지 않는 negation 항목은 명시적으로 거부합니다. 범용 glob 해석기는 도입하지 않습니다.

`inventory`, source·staging의 `verifyPayload`, 최종 tarball 검증은 유지합니다. 따라서:

- 직접 npm 포장에서는 Python 캐시가 제외됩니다.
- 공식 `pack:release`는 캐시가 존재하는 source를 계속 거부합니다.
- 공식 release에는 캐시가 없는 source가 필요합니다.
- 캐시 자동 삭제나 source 검증 우회는 추가하지 않습니다.

직접 포장의 캐시 제외가 공식 release의 다른 보장까지 제공하지는 않습니다. 게시 준비에는 기존 workflow와 같은 `pack:release` 산출물 경로를 사용합니다.

**정확한 구현 범위와 소유권**

Coder 한 명이 아래 네 파일을 함께 소유합니다.

| 파일 | 변경 내용 |
|---|---|
| `package.json` | 두 제외 항목 추가, 버전 `0.1.8` |
| `lib/release/artifact.mjs` | 정확한 두 제외 항목 허용·건너뛰기, 기타 미지원 규칙 거부 |
| `package-lock.json` | 최상위·루트 package 버전 `0.1.8`로 동기화 |
| `MANIFEST.sha256` | 변경된 보호 파일을 기존 generator로 갱신 |

설치·upgrade 동작, verifier, inventory, manifest 생성 규칙, npm lifecycle, workflow, 의존성은 수정 범위에 포함하지 않습니다. 실제 publish·push·merge와 설치된 global package 교체도 제외합니다.

**근거**

- `package.json:27–40`: npm 배포 포함 목록.
- `scripts/update-manifest.mjs:9,18`: `__pycache__` 제외.
- `lib/installer/manifest.mjs:15–19`: 파일 순회와 미등록·hash 불일치 거부.
- `lib/release/artifact.mjs:33`: 현재 glob 거부.
- `lib/release/artifact.mjs:124,134–135`: source·staging·최종 산출물 검증.
- Orchestrator 제공 근거: npm `10.9.4`에 포함된 `npm-packlist@9.0.0`의 ordered ignore 처리와 [npm-packlist 공식 문서](https://github.com/npm/npm-packlist)의 negative `files` 지원.

기존 승인 계획의 release 검증 원칙은 재사용합니다. 해당 계획은 버전 증가와 publish를 제외했으므로 이번 변경의 구현 승인 근거로 확대하지 않습니다.

**수용 기준**

1. npm 포장 목록에 `__pycache__` 내부 파일과 `.pyc`가 포함되지 않습니다. 두 harness와 다른 포함 디렉터리에도 적용됩니다.
2. 필수 runtime 파일과 일반 파일은 보존됩니다.
3. 깨끗한 source의 공식 `pack:release` 산출물이 기존 최종 검증을 통과합니다.
4. 캐시가 존재하는 source의 공식 release는 기존처럼 거부됩니다.
5. 정확한 두 제외 규칙 이외의 미지원 glob·negation은 거부됩니다.
6. package·lockfile 버전이 `0.1.8`로 일치하고 manifest가 최신입니다.

**집중 검증 경로**

검증이 승인되면 격리된 임시 source에서 캐시와 일반 파일을 배치하여 직접 npm 포장 목록을 확인합니다. 이어 깨끗한 source의 공식 release 산출물과 캐시 오염 source의 거부를 확인하고, metadata·manifest 일치를 검사합니다. 실제 publish는 필요하지 않습니다.

개발 지침상 사용자가 테스트·검증을 요청하기 전에는 테스트를 추가하거나 실행하지 않습니다. 이번 설계 단계에서는 테스트와 검증 명령을 실행하지 않았습니다.

**가정·보류 조건과 자체 검토**

Orchestrator의 registry 조회 시점에는 `0.1.8`이 없고 latest는 `0.1.7`입니다. 실제 게시 가능 여부는 향후 publish 단계에서 다시 확인할 사항입니다.

구현은 bounded 변경이지만 포장 규칙·release 입력 해석·metadata가 함께 맞아야 하므로 한 task 계획이 필요합니다. source 캐시를 허용하는 요구, npm 버전별 제외 동작 차이, 필수 파일 누락이 발견되면 범위를 재결정해야 합니다.

자체 검토 결과, 기존 verifier를 완화하지 않고 직접 포장의 캐시 유입을 막는 구성이며 새 metadata 예외도 필요하지 않습니다. 남은 실증 사항은 실제 npm 포장 결과입니다.

사용자가 본 설계를 승인했습니다. 대응하는 한 task 계획 초안은 `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-10-22-python-cache-packaging.md`에 저장했으며, 구현은 해당 계획 검토와 실행 방식 선택 후에 진행합니다.
