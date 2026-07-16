# One UI Agent — AI 어시스턴트 안내서

이 문서는 회사 환경의 AI 어시스턴트(Claude/Gemini)가 최소 사용량으로 이 프로젝트를 파악하기 위한 안내서다.
**설계 전체는 DESIGN.md가 기준점** — 구조 질문은 그 문서를 먼저 읽어라.
**회사에서 이어받아 할 일은 HANDOVER.md** — 인계 작업을 도울 때는 그 문서를 따르라.

## 프로젝트 한 줄 요약

One UI Feature의 버전 탑재 여부를 결정하는 부사장급 리뷰 회의를 준비·운영하는 파이프라인.
AI 페르소나(prompts/)가 리뷰·검사·예측을 수행하고, 20명이 대시보드로 조종한다.

## 실행

```
python server.py          # http://localhost:8765 — pip 설치 불필요 (표준 라이브러리만)
python scripts/gen_demo_data.py   # 데모 데이터 재생성 (실데이터 있으면 실행 금지)
```

## 아키텍처 (파일 → 역할)

| 경로 | 역할 |
|---|---|
| `server.py` → `server/api.py` | HTTP API + 정적 서빙. 엔드포인트는 api.py의 do_GET/do_POST 라우팅 참조 |
| `server/store.py` | JSON 저장소 — 쓰기 락, 낙관적 잠금(rev), 알림 발행(notify), 사용량 기록 |
| `server/jobs.py` | 작업 큐(직렬) + 파이프라인 작업들(job_*) + 질의(run_query) |
| `server/engines.py` | 엔진 어댑터: mock(데모) / spawn(Gemini) / persistent(Claude). 계약: run(persona, prompt, payload, attachments) → JSON |
| `web/js/app.js` | 셸: 라우터, 폴링, 공통 컴포넌트(모달·토스트·배지·슬라이드 뷰어) |
| `web/js/views/*.js` | 화면 1개 = 파일 1개. 새 화면은 App.register("route", {title, render}) 복제 |
| `prompts/*.md` | 페르소나 = 파일. `_common.md`이 모든 호출 앞에 주입됨 |
| `config/excel_schema.json` | 논리 필드↔실제 엑셀 열 매핑 — 설정 화면에서 인입된 열 기반 선택 박스로 편집. **열 이름을 코드에 하드코딩하지 마라** |
| `config/grade_rules.json` → `server/grading.py` | 등급 하드룰 — 자료 보완 필요(DOC)·단순 공유(SHARE)를 AI보다 먼저 판정. 걸린 건은 AI 호출 안 함 |
| `data/<버전>/` | 모든 상태. features/reviews/pl_checks/schedule/meetings/actions.json |

## 불변 규칙 (수정 시 지킬 것)

1. **모든 상태는 JSON 파일** — DB·외부 저장소 도입 금지. 디버깅 = 파일 열람이 설계 의도.
2. **rejected는 통계 모수 제외** — KPI 계산 시 `f.decision !== "rejected"` 필터가 규칙.
3. **AI 제안 → 사람 확정** — 새 AI 판단 단계를 추가하면 반드시 사람 수정 + 이력(history) + needs_human 경로를 함께 만들 것.
4. **페르소나 출력 스키마 = 파서 계약** — prompts/의 JSON 필드명을 바꾸면 server/jobs.py 파서와 web/ 렌더러도 함께 바꿔야 한다.
5. **캐시 3중 규칙** — 입력 해시(row_hash), 트리거 열(review_trigger_columns), 프롬프트 해시(prompt_hash_*). 재실행 로직을 건드릴 때 셋 다 고려.
6. **의존성 제로 유지** — pip/npm 패키지 추가 금지. 표준 라이브러리와 바닐라 JS로 해결하라.
7. **엑셀의 열 이름도 값도 판정 규칙도 하드코딩 금지** — 회사마다 어휘와 규칙이 다르다. 열은 `fields`/`managed_columns`, 판정은 `dev_done_rule`(예: CL 열에 값 있으면 개발 완료)처럼 **설정에서 읽고, 설정 UI는 실제 데이터를 나열해 고르게 + 저장 전 미리보기**로 검증하게 만든다. 판정 로직은 `App.isDevDone()`처럼 한 곳에만 둔다.

## 회사에서 해야 할 일 (우선순위 순)

1. `config/engines.json`의 default_engine을 "gemini"로 → 현황판 "엔진 자가진단" 실행 → `server/engines.py` `_spawn`의 command 플래그를 실제 Gemini CLI 규약으로 확정
2. 실데이터 인입: 현황판 "① 인입" 업로드(서버 내장 파서) 또는 `scripts/excel_to_json.ps1`(대량/자동화) → 설정 화면에서 스키마 매핑 확정
3. PPT 업로드 시 PNG 렌더링이 자동 실행됨 (ppt_render 작업 → scripts/ppt_render_one.ps1, PowerPoint 필요). Office 없는 PC에서는 자동 건너뜀 — 회사 서버 PC에서 업로드하면 끝. 대량 일괄 처리는 scripts/ppt_to_png.ps1
4. PLM 어댑터: `server/api.py`의 `api_plm_advance`(mock)를 실제 PLM API 호출로 교체
5. `prompts/persona-sw-director.md`의 "판단 성향" 섹션을 실제 회의록 기반으로 교체
6. `templates/`에 회사 보고 PPT 템플릿 등록 + `server/jobs.py` job_report_ppt를 ppt_fill.ps1 호출로 전환
7. 골든셋(golden/golden_set.json)에 사람 정답 20~30건 등록 → 페르소나 튜닝을 측정 기반으로
8. 백업: `scripts/backup_data.ps1`을 작업 스케줄러에 등록
9. 인증/보안: 사내 정책 확인 (현재는 이름 입력뿐 — api_login 어댑터 교체 지점)

## 흔한 작업 레시피

- **새 KPI 추가**: web/js/views/dashboard.js의 kpi() 호출 한 줄 + 필요시 드릴다운 필터(review.js f-state)
- **새 페르소나 추가**: prompts/에 md 생성 → server/jobs.py에 job 함수 + KIND_LABEL/HANDLERS 등록 → 화면에 실행 버튼
- **알림 유형 추가**: store.notify(type, text) 호출 + web/js/views/notifications.js의 ICONS/TYPES에 한 줄
