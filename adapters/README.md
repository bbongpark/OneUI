# adapters/ — 드롭인 어댑터

코어(`server/`)를 **수정하지 않고**, 이 폴더에 **파일을 추가**하는 것만으로 CLI 엔진·PLM을 실제 연결한다.

- 어댑터 파일이 **없으면** 코어가 mock/내장으로 동작한다 (개인 PC·데모).
- 어댑터 파일이 **있으면** 코어가 자동으로 위임한다 (회사 실환경).

> 표준 라이브러리만 사용한다(의존성 제로 원칙). API 키·엔드포인트는 코드에 하드코딩하지 말고 환경변수나 config에서 읽는다.

---

## 1. PLM 연결

1. `plm_example.py`를 **`plm.py`로 복사**한다.
2. `advance(action)` 함수를 회사 PLM API 호출로 채운다.
   - 입력: 액션 아이템 dict (`id`, `feature_index`, `action`, `owner_dept`, `due`, `plm_status`, `plm_id`, …)
   - 반환: 바꿀 상태 필드만 — `{"plm_status": "sent|in_progress|done", "plm_id": "..."}`
3. 끝. 추적 화면의 "PLM 전송/진행"이 실제 PLM을 호출한다. (`server/api.py`의 `api_plm_advance`가 자동 위임)

`plm.py`가 없으면 코어는 `pending → sent → in_progress → done` mock으로 동작한다.

## 2. CLI/AI 엔진 연결

대부분은 **어댑터가 필요 없다** — `config/engines.json`에서 `type: "spawn"`(Gemini류)·`"persistent"`(Claude류)에 `command`만 맞추면 된다(→ `HANDOVER.md` 1번).

`spawn`/`persistent`로 안 되는 **특수 연결**(별도 인증, 비표준 프로토콜, 응답 후처리)일 때만 어댑터를 쓴다.

1. `engine_example.py`를 **`engine_<name>.py`로 복사**한다 (예: `engine_gemini.py`).
2. `run(persona, prompt_text, payload, attachments)` 를 채운다.
   - 반환은 반드시 각 페르소나의 출력 스키마 dict (→ `CODEMAP.md` §6 계약 표, `prompts/*.md`).
3. `config/engines.json`에서 그 엔진의 `type`을 `"custom"`으로, `default_engine`(또는 `persona_engines`)을 그 이름으로 지정한다.

```json
"engines": {
  "gemini": { "type": "custom", "description": "adapters/engine_gemini.py에 위임" }
}
```

`adapters/engine_<name>.py`도 `adapters/engine.py`도 없으면 `custom` 엔진은 실행 시 에러를 낸다(어떤 파일을 만들지 안내).

---

## 규약 요약

| 어댑터 파일 | 필수 함수 | 코어 위임 지점 | 없을 때 |
|---|---|---|---|
| `adapters/plm.py` | `advance(action) -> {plm_status, plm_id}` | `server/api.py` `api_plm_advance` | 4단계 mock |
| `adapters/engine_<name>.py` | `run(persona, prompt_text, payload, attachments) -> dict` | `server/engines.py` `_custom` (type=custom) | 실행 에러(안내) |

어댑터가 import 에러로 깨져도 로더(`adapters/__init__.py`)가 `None`으로 폴백하므로 **코어는 죽지 않는다**(stderr에 경고). `adapters.status()`로 어떤 어댑터가 붙었는지 확인할 수 있다.
