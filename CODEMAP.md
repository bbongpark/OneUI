# One UI Agent — 코드 맵 (개발자·AI 어시스턴트용)

> **회사에서 코드를 이어받는 Claude/Gemini가 이 파일 하나로 전체 구조를 파악하고 바로 개발에 들어가는 것이 목표.**
> 설계 배경은 [DESIGN.md](DESIGN.md), 회사 작업 순서는 [HANDOVER.md](HANDOVER.md), 화면 사용법은 [MANUAL.md](MANUAL.md).
> 짧은 규칙 요약은 [CLAUDE.md](CLAUDE.md)에도 있다.

---

## 0. 30초 요약

- **스택**: Python 표준 라이브러리 HTTP 서버 + 바닐라 JS(빌드 없음) + PowerShell COM(Office). **의존성 0개** (pip/npm 금지).
- **상태**: 전부 `data/<버전>/*.json` 파일. DB 없음. 서버가 유일한 writer. 디버깅 = 파일 열람.
- **AI**: 페르소나 = `prompts/*.md` 파일. 엔진 어댑터가 mock/gemini/claude를 갈아끼운다. 파이프라인 본체는 엔진을 모른다.
- **공통 패턴**: AI가 제안 → 사람이 확정(수정·이력·needs_human).
- **하드코딩 금지**: 엑셀 열 이름·값·판정 규칙은 전부 `config/`에서 읽는다.

---

## 1. 큰 그림 — 요청이 흐르는 길

```
브라우저(web/)  ──HTTP──▶  server/api.py (라우팅)
   폴링 2초                    │
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
              즉시 응답    작업 큐      질의(동기)
              (store 읽기) (jobs.py)   (run_query)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              engines.py  grading.py  store.py
              (AI 호출)   (하드룰)    (JSON 락 저장 + notify)
                    │
              prompts/*.md ── 페르소나 프롬프트
```

- 무거운 작업(AI 호출)은 **작업 큐**에 넣고 즉시 `{queued}` 응답. 브라우저는 2초마다 `/api/queue`·`/api/version/<v>`를 폴링해 갱신.
- 큐는 **직렬**(동시 1개). 500건 전체 리뷰는 수 시간 → 야간 실행 전제.
- 질의만 큐를 우회해 동기 실행(가벼움).

---

## 2. 디렉토리 지도

| 경로 | 역할 |
|---|---|
| `server.py` | 엔트리. `ThreadingHTTPServer`로 `server/api.py`의 핸들러 구동 (포트 8765). |
| `server/api.py` | HTTP 라우팅(do_GET/do_POST) + 정적 서빙 + API 구현 함수(`api_*`). |
| `server/store.py` | JSON 저장소. 쓰기 락, 낙관적 잠금(rev), 알림(notify), 사용량 기록. **모든 파일 접근의 단일 창구.** |
| `server/jobs.py` | 작업 큐(직렬 스레드) + 파이프라인 작업 13종(`job_*`) + 질의(`run_query`). |
| `server/engines.py` | 엔진 어댑터. `run(persona, prompt, payload, attachments)→dict` 계약. mock/spawn/persistent. |
| `server/grading.py` | 등급 하드룰. `doc_check`(AI 앞단)·`share_check`(P2 이후). AI보다 먼저 판정해 토큰 절약. |
| `server/ingest.py` | 엑셀·PPT 인입. 행 파싱, 재리뷰 트리거 감지, 재등록 감지, 슬라이드 매핑. |
| `server/office.py` | stdlib만으로 xlsx/pptx 파싱 (zip + XML). 외부 라이브러리 없음. |
| `prompts/*.md` | 페르소나 = 파일. `_common.md`이 모든 호출 앞에 주입된다. |
| `config/*.json` | 설정. 열 매핑·엔진·등급 규칙·사용자. **여기서 읽고 UI에서 편집.** |
| `web/index.html` | 셸 HTML. 뷰 스크립트 10종을 순서대로 로드. |
| `web/js/app.js` | 프론트 셸: 라우터, 폴링, 공통 컴포넌트(모달·토스트·배지·슬라이드 뷰어), 공개 헬퍼. |
| `web/js/views/*.js` | 화면 1개 = 파일 1개. `App.register("route", {title, render})`. |
| `web/css/app.css` | 전역 스타일. |
| `adapters/` | **드롭인 어댑터** — 코어 수정 없이 파일 추가만으로 PLM·CLI 엔진을 실제 연결. `plm.py`/`engine_<name>.py`가 있으면 코어가 위임, 없으면 mock. `*_example.py`는 템플릿. (`adapters/README.md`) |
| `scripts/*.ps1` | PowerShell: 엑셀 변환, PPT→PNG 렌더, 보고 PPT 채우기, 백업. Office 필요. |
| `templates/` | 보고 PPT 템플릿, 골든셋 양식, 변경점 템플릿. |
| `data/<버전>/` | 모든 상태 (git 미추적). |

---

## 3. 서버 상세

### 3.1 store.py — 상태 관리의 심장

모든 데이터 접근은 여기를 거친다. 공개 함수:

| 함수 | 하는 일 |
|---|---|
| `path(*p)` | 프로젝트 루트 기준 경로 (config/, templates/ 등). |
| `dpath(*p)` | `data/` 기준 경로. `dpath("8.5", "reviews.json")`. |
| `load(fp, default)` | JSON 읽기. 없으면 default. |
| `save(fp, obj)` | JSON 쓰기 (락 하에). |
| `update(fp, fn, default, base_rev)` | **읽기→fn(obj)→쓰기를 락으로 원자화.** rev 증가. `base_rev`가 현재와 다르면 `ConflictError`(409). |
| `versions()` | `data/` 하위 버전 목록. |
| `notify(ntype, text)` | 알림 발행 (notifications.json에 append). **알림 확장의 단일 지점** — 사내 메신저는 여기에 붙인다. |
| `record_usage(engine, job, in_tok, out_tok, usd)` | usage.json에 호출별 토큰·비용 기록. |

**낙관적 잠금**: 클라이언트가 rev를 들고 있다가 저장 시 함께 보낸다. 그사이 남이 바꿨으면(rev 불일치) 409 → 프론트가 "새로고침 후 재시도" 안내. 동시 20명 편집 안전장치.

### 3.2 jobs.py — 작업 큐 + 파이프라인

- **큐**: `enqueue(kind, version, user, params)`로 넣으면 백그라운드 스레드가 직렬 처리. `snapshot()`이 현재/대기/완료를 반환(`/api/queue`).
- **작업 13종** (`KIND_LABEL`·`HANDLERS`에 등록):

| kind | 함수 | 하는 일 |
|---|---|---|
| `title` | job_title | 변경점 → 12~25자 제목 (aux-title). 인입 직후 자동. |
| `review` | job_review | ① DOC 하드룰 → ② 부문 4종 검토 의견 (등급 없음). |
| `synthesis` | job_synthesis | 종합이 등급 1개(P0/P1/P2) 판정 → P2 중 SHARE 규칙 적용. |
| `pl` | job_pl | 발표자료(PPT) 완성도 검사. 매핑 확정 필요. |
| `schedule` | job_schedule | 소요시간 추정 → 기존 슬롯에 배정(P0·P1만). 끝나면 predict 자동 enqueue. |
| `predict` | job_predict | SW담당 예상 판정. **PL 준비(ready===true) 안건만.** |
| `minutes` | job_minutes | 회의록 → 결정·액션 추출(확정은 별도 API). |
| `plm_judge` | job_plm_judge | 액션의 후속 보고 필요 여부 판단. |
| `insight` | job_insight | 버전 지향점·트렌드 리포트(markdown). |
| `golden` | job_golden | 골든셋 실행 → 일치율. |
| `report_ppt` | job_report_ppt | 보고 산출물 생성(현재 markdown, 회사에서 ppt_fill.ps1로 전환). |
| `selftest` | job_selftest | 엔진 자가진단. |
| `ppt_render` | job_ppt_render | PPT→PNG 렌더(ppt_render_one.ps1, Office 필요). |

- **`_row_view(row)`**: 페르소나에 넘길 행을 `managed_columns`로 필터링(미지정이면 전체). AI 입력 노이즈·토큰 절감.
- **`_batches(feats, v)`**: `batch_size`(config)만큼 나눠 호출.
- **`run_query(question, versions, mode)`**: 키워드로 후보 청크 추출 → aux-query 1회. 큐 우회 동기 실행.

### 3.3 engines.py — 엔진 어댑터 (엔진 교체의 전부)

**계약**: `run(persona, prompt_text, payload, attachments=None) -> dict`. 파이프라인은 이 함수만 안다.

- `engine_for(persona)`: `config/engines.json`의 `persona_engines[persona].engine` → 없으면 `default_engine`. 페르소나별로 다른 엔진/모델 지정 가능.
- **3가지 타입**:
  - `mock`: `_mock()`이 페르소나별로 그럴듯한 가짜 JSON 생성. 시드는 feature_index 기반이라 재현 가능. 화면 개발·뼈대 검증용.
  - `spawn` (Gemini): 호출마다 프로세스. 프롬프트+데이터를 임시 `.md`로 써서 `command`에 전달(`{prompt_file}` 치환). 첨부 이미지는 명령 뒤에 경로로 붙는다. **회사에서 자가진단 후 플래그 확정** → `_spawn()`.
  - `persistent` (Claude): 상주 워커. stream-json으로 stdin/stdout. N작업마다 재시작 → `_persistent()`.
- `_extract_json(text)`: 출력에서 첫 `{...}` 추출. CLI가 잡소리를 섞어도 JSON만 건진다.
- `selftest()`: 실제 엔진의 비대화형/JSON/이미지/파일 읽기 프로브. mock은 항상 통과.

> **엔진을 바꾸는 작업은 여기 + config/engines.json만 건드리면 된다.** job_* 코드는 손대지 않는다.

### 3.4 grading.py — 하드룰 (AI를 아끼는 문지기)

- `doc_check(row)`: 변경점이 `grade_rules.json`의 `doc_fix`(min_length·require_all)를 못 채우면 **DOC(자료 보완 필요)**. 걸리면 AI 호출 안 함.
- `share_check(row)`: AI가 P2로 판정한 건 중 `share.rules`(op: equals/contains/in/empty/not_empty/regex)에 하나라도 맞으면 **SHARE(단순 공유)**.
- 순서: **DOC(AI 앞) → AI가 P0/P1/P2 → SHARE(P2 뒤)**.

### 3.5 api.py — 엔드포인트

**GET**: `/api/bootstrap`(초기 상태), `/api/version/<v>`(그 버전 전체 데이터), `/api/queue`, `/api/notifications`, `/api/usage`, `/api/prompts[/<name>]`, `/api/golden`, `/api/config/<name>`, `/api/engine_status`, `/api/insight/<v>`, `/api/output/<v>[/<file>]`, 정적(`/css /js /assets /slides /templates`).

**POST**: `/api/login`, `/api/run`(작업 큐 투입), `/api/override`(등급 수정), `/api/schedule/{move,slot,plan,est}`, `/api/meetings/confirm`, `/api/plm/advance`(**mock — 실제 PLM으로 교체 지점**), `/api/followup`, `/api/query`, `/api/notifications/read`, `/api/mail_templates`(공지 메일 인사말/맺음말 팀 공유 저장), `/api/config/<name>`, `/api/ingest/upload`, `/api/mapping/{assign,confirm}`, `/api/golden/{upload,delete}`, `/api/prompts/<name>`(저장).

- 예외 → 500 JSON. `ConflictError` → 409(낙관적 잠금 충돌).

---

## 4. 프론트 상세

### 4.1 app.js — 셸 + 공개 헬퍼

`App` 전역 객체. 뷰가 쓰는 공개 API:

| 헬퍼 | 용도 |
|---|---|
| `register(route, {title, icon, render})` | 화면 등록. `render(el, app)`가 DOM을 그린다. |
| `route()` / `reload()` | 해시 라우팅 / 서버 데이터 재로드. |
| `state` | `{user, version, boot, data, queue, notifs, usage}`. 현재 화면이 읽는 캐시. |
| `GRADES` | P0/P1/P2/SHARE/DOC 라벨·색. `gradeBadge(g)`. |
| `DECISIONS` | support/hold/reject 라벨·색. `recBadge(r)`. |
| `statusBadge(s)` | 단계 뱃지(ingested/reviewing/meeting_wait/decided). |
| `isDevDone(f)` | 개발 완료 판정 — `dev_done_rule`을 원본 행에 적용. **판정 로직의 단일 지점.** |
| `scheduleRisk(f)` / `riskBadge2(f)` | 일정 리스크(있음/없음) + 근거. DVR 대비 개발 일정. |
| `hasValue(v)` | 자리채움값(`-`,`TBD`,`미정`…) 을 빈 값으로 취급. |
| `modal({title, body, foot, wide})` | 모달 생성. `.modal-back` 반환, `back.remove()`로 닫음. |
| `columnPicker({cols, managed, newCols, onSaved})` | 관리 열 선택 창. |
| `slideViewer(feature, plCheck)` | 슬라이드 좌우 뷰어(PL 지적 오버레이). |
| `el(html)` / `fmtDate(s)` / `toast(msg, err)` | 유틸. |
| `copyText(s)` / `copyRich(html, plain)` | 클립보드 복사. **secure context(localhost/https)면 navigator.clipboard, 사내 http면 execCommand 폴백** — 둘 다 지원해야 회사 배포에서 동작. |
| `extractMails(s)` / `mailTableHtml(cols,rows,wideCols)` / `mailDraftModal(o)` | 공지 메일 초안 공용. `extractMails`는 셀에서 `.com` 메일만 추출. `mailDraftModal`은 수신자·제목·편집 가능 인사말/맺음말·표(검은 무채색, 긴 열 `wideCols`는 min-width, 기본 `["변경점"]`)·복사 버튼. `o.tableAtEnd`=false면 인사말·표·맺음말(일정 관리), true면 인사말·맺음말·표 맨 끝(회의). 담당자 **이름** 열은 표에, **메일주소** 열(`meeting_recipient_columns`)은 수신자에. `o.draftKey`(예: "schedule"/"meeting")를 주면 인사말/맺음말을 **서버에 종류별 팀 공유 저장**(`POST /api/mail_templates`, blur 시) — 누가 다듬어도 다음 메일에 유지("기본 문구로" 링크로 복원). 그래서 인사말 기본값엔 날짜를 넣지 않는다(날짜는 제목·표에). `o.colWidths`({열:px})로 메일 표 열 너비를 고정한다(미지정 시 메일 클라이언트가 열을 균등 분배해버림 — 변경점은 wideCols min-width). |

- **색 규칙**: P0=적, P1=호박, P2=회색, 리스크/미준비=경고색, **파랑=사람이 눌러야 할 곳**(AI 제안 대기).
- **텍스트 배지 규칙**: 등급 딱지엔 P0/P1/P2/공유/보완만. 수정·확인·충돌 같은 플래그는 "판정 근거" 열로.

### 4.2 뷰 (web/js/views/)

각 파일이 화면 하나. `render(el, app)`에서 `app.state.data`(그 버전 전체)를 읽어 그린다. 데이터 구조:
`app.state.data = {features, reviews, pl_checks, schedule, meetings, actions, pred_stats}` (각각 `data/<v>/*.json`).

- **dashboard**: KPI + 파이프라인 + 큐. KPI 드릴다운은 `drill: "stage:decided"` / `"cond:risk"` 접두사로 리뷰 보드 필터를 지정(§6 확장 레시피).
- **review**: 테이블 + 단계/조건 필터 + 상세 모달 + 오버라이드 + PPT 매핑.
- **meetings**: 달력(더블클릭=회의일, 클릭=표시) + 드래그 안건 배정 + SW담당 적중률 카드.
- **schedule** (일정 관리): 개발 일정 임박 항목을 날짜별로 묶고 날짜별 공지 메일 초안 생성. 담당자 열(`schema_fields.dev_owner`)에서 `.com` 메일을 정규식으로 뽑아 `;` 연결. 복사는 `App.copyText`/`App.copyRich`(secure context면 navigator.clipboard, 사내 http면 execCommand 폴백).
- **tracking / insight / query / personas / settings / notifications / logs**: MANUAL.md §3 참조.

---

## 5. 데이터 스키마 (data/<버전>/)

| 파일 | 구조 요약 |
|---|---|
| `features.json` | `{version, readonly, features:[{feature_index, name(AI제목), row{엑셀전체 — 관리열 밖 CL·AI상세 열도 여기 다 있다}, function_name, ai_category, decision, status, reregistered_from, input_changed, slides[]}]}` |
| `reviews.json` | `{rev, items:{<idx>:{personas{experience_planning,ux,dev,cxi}, synthesis{final_grade,status,rationale,divergent,divergent_summary,meeting_questions,ai_grade}, hard_rule, share_rule, override, history[]}}}}` |
| `pl_checks.json` | `{rev, items:{<idx>:{ready, doc_issues[], slide_issues[{slide,issue}]}}}` |
| `schedule.json` | `{rev, dvr, milestones[], slots:[{date, time, capacity_min, items:[{feature_index, est_min, followup, predicted{...}}]}], unassigned[]}` |
| `meetings.json` | `{rev, items:[{id, date, time, title, minutes_raw, extracted{decisions,actions}, confirmed}]}` |
| `actions.json` | `{rev, items:[{id, feature_index, action, owner_dept, due, plm_status, plm_id, report_needed, followup_scheduled}]}` |
| `prediction_stats.json` | `{rev, runs:[{meeting_id, at, n, accuracy, detail:[{feature_index, predicted, actual, match}]}]}` |
| `insight.md` | 인사이트 리포트 본문. |
| `mail_templates.json` (전역, data/ 바로 아래) | 공지 메일 인사말/맺음말 팀 공유 저장: `{schedule:{top,bot}, meeting:{top,bot}}`. bootstrap이 실어 보낸다. |
| `slides/ references/ output/ uploads/` | 슬라이드 PNG / 참고자료 / 산출물 / 업로드 원본. |

---

## 6. 불변 규칙 (수정 시 반드시 지킬 것)

1. **모든 상태는 JSON 파일** — DB·외부 저장소 금지. 디버깅 = 파일 열람이 설계 의도.
2. **rejected(미지원)는 통계 모수 제외** — KPI 계산 시 `f.decision !== "reject"` 필터가 규칙.
3. **AI 제안 → 사람 확정** — 새 AI 판단 단계엔 반드시 사람 수정 + `history` + `needs_human` 경로를 함께 만든다.
4. **페르소나 출력 스키마 = 파서 계약** — `prompts/`의 JSON 필드명을 바꾸면 `jobs.py` 파서와 뷰 렌더러도 함께 바꿔야 한다(아래 표).
5. **캐시 3중 규칙** — 입력 해시(row_hash) · 트리거 열(review_trigger_columns) · 프롬프트 해시(prompt_hash). 셋 다 같으면 재실행을 건너뛴다. 재실행 로직 수정 시 셋 다 고려.
6. **의존성 제로** — pip/npm 추가 금지. 표준 라이브러리 + 바닐라 JS.
7. **열 이름·값·판정 규칙 하드코딩 금지** — 전부 config에서 읽고, 설정 UI는 실제 데이터를 나열해 고르게 + 저장 전 미리보기. 판정 로직은 한 곳에만(`App.isDevDone` 등).

### 페르소나 ↔ 파서 계약 (필드명 고정)

| 페르소나 | 핵심 출력 필드 |
|---|---|
| persona-{experience_planning,ux,dev,cxi} | `opinion`, `key_question` |
| persona-synthesis | `final_grade`(P0/P1/P2), `status`, `rationale`, `divergent`, `divergent_summary`, `meeting_questions` |
| persona-pl | `ready`, `doc_issues[]`, `slide_issues[{slide,issue}]` |
| persona-sw-director | `predicted_decision`(support/hold/reject), `confidence`, `rationale`, `predicted_conditions[]`, `anticipated_questions[]` |
| aux-title | `title` |
| aux-minutes-extract | `decisions[{feature_index,decision,conditions}]`, `actions[]` |
| aux-duration-estimate | `est_min` |
| aux-plm-report-judge | `report_needed`, `rationale` |
| aux-query | `answer`, `sources[]`, `found` |
| aux-insight-report | `markdown` |

---

## 7. 확장 레시피

- **새 KPI 추가** (dashboard): `kpi(...)` 호출 한 줄 + 드릴다운은 `drill: "stage:<status>"` 또는 `"cond:<조건>"` 접두사. 조건이면 review.js의 조건 드롭다운에 `<option>`도 추가. (review.js가 `preset.split(":")`로 필터를 정하므로 접두사만 맞추면 된다.)
- **새 페르소나 추가**: `prompts/`에 md 생성 → `jobs.py`에 `job_*` 함수 + `KIND_LABEL`/`HANDLERS` 등록 → 출력 스키마 파서 + 뷰 렌더 → 화면에 실행 버튼. mock도 `_mock()`에 분기 추가.
- **새 알림 유형**: `store.notify(type, text)` 호출 + `notifications.js`의 ICONS/TYPES에 한 줄.
- **새 화면**: `web/js/views/`에 파일 + `App.register(...)` + `index.html`에 script 태그 + 네비 등록.
- **엔진 교체/추가**: 보통 `config/engines.json`의 `command`만(spawn/persistent). 특수 연결은 `adapters/engine_<name>.py`의 `run()` + config `type:"custom"` — 코어 무수정.
- **PLM·외부 시스템 연결**: `adapters/plm.py`의 `advance()` 드롭인. 코어(`api_plm_advance`)가 있으면 위임, 없으면 mock. 새 외부 연동도 이 패턴(어댑터 로더 `adapters/__init__.py`)을 따른다.

---

## 8. 최근 변경 (이어받는 사람이 알아야 할 것)

- **결정 3종**: go/no_go/defer/conditional_go(구) → **support/hold/reject(지원/보류/미지원)**. `App.DECISIONS` 참조. 미지원=모수 제외 + 재등록 추적.
- **등급 2축**: `persona-synthesis.md`가 파급력 + 대면 필요성(결정 **또는** 공유·정렬)으로 판정. 부문 페르소나 의견에 파급력·타 부문 공유 필요를 담게 함(`_common.md`).
- **리뷰 보드 상세**: CL·적용모델·VOC건수를 `managed_columns`에서 제외(상세·AI 입력에서 숨김). 단, **CL은 `dev_done_rule`이 원본 행에서 직접 읽어** 개발 완료 KPI는 그대로 동작(ingest가 전체 열 저장). `ingest.py`가 `dev_done_rule.column`을 '아는 열'로 처리해 새 열 오탐 방지.
- **필터 분리**: 상태 필터 → **단계**(f.status, 하나) + **조건**(겹침). 드릴다운은 `stage:`/`cond:` 접두사.
- **SW담당 예상**: `job_predict`가 **PL ready 안건만** 예측(자료 없으면 예측 근거 없음). 재실행 시 stale 예측 비움. 리뷰 보드 상세 모달 맨 아래에 예상+근거 표시.
- **적중률 카드**: 큰 숫자 = 최근 5개 회의 **안건 수 가중 종합**(단순 평균 아님, detail.match 합산).
- **AI 상세 조건부 표시**: 리뷰 보드 상세 모달에서 `ai_category`가 `config/excel_schema.json`의 `ai_detail.hide_values`(X·AI 없음 등)에 없으면 `ai_detail.columns`를 추가 섹션으로 표시. 열 이름·트리거 값 모두 config(하드코딩 금지). managed_columns와 별개 — 상세 표시 전용이라 AI 입력엔 안 들어가고 원본 행에서 직접 읽는다.
- **일정 관리 화면(schedule)**: 개발 일정 임박 항목 날짜별 그룹 + 공지 메일 초안(수신자 `;` 연결 + 표 + 편집 가능 인사말/맺음말). 표 컬럼: 인덱스·기능명·변경점·개발일정·지연사유(메일 표는 인라인 스타일). 담당자 열은 `schema_fields.dev_owner`, 지연사유는 `dev_delay_reason`(둘 다 config). 복사는 `App.copyText`/`copyRich`(http 폴백 포함).
- **개발일정 지연 감지**: `ingest.py`가 갱신 인입 시 `dev_schedule`이 이전보다 뒤로 밀린 행을 `_is_later`로 감지 → `feature.dev_delay{from,to,reason}` 기록 + `store.notify("delay", …)`. 알림 타입 `delay`(notifications.js ICONS/TYPES). 트리거 열과 무관하게 개발일정만 바뀌어도 감지.

---

## 9. 함정 / 주의

- **server/*.py 수정 후 반드시 서버 재시작.** 안 하면 "코드가 안 먹는다"고 오판한다. web/ 파일은 브라우저 하드 리로드로 충분.
- **PowerShell에서 `python -c "한글"` 금지** — cp949 인코딩 에러. UTF-8 스크립트 파일로 실행.
- **날짜 파싱**: `new Date("2026-08-28")`은 UTF로 하루 밀린다. `App.parseDate()`가 정규식으로 로컬 Date 생성(그걸 써라).
- **managed_columns는 "AI 입력·상세 표시" 필터일 뿐** — 인입은 항상 전체 열 저장. 판정에 쓰는 열(CL 등)은 여기 없어도 원본 행에서 읽는다.
- **PPT 인덱스 매핑**(`F###`)이 회사 규칙과 다를 수 있다 — 첫 업로드 시 매핑률 확인, 다르면 `ingest.py`의 `ingest_ppt()`.
- **mock 상태에서 골든셋 일치율은 무의미** — 시드 기반 가짜 값. Gemini 연결 후 유효.
- **PNG 렌더·비전 검사는 Office 필수** — 개인 PC에서 미검증. 회사 서버 PC에서 확인.
