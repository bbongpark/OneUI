# -*- coding: utf-8 -*-
"""엔진 어댑터 예제 — 이 파일을 adapters/engine_<name>.py로 복사한다(예: engine_gemini.py).
그리고 config/engines.json에서 그 엔진의 type을 "custom"으로 두면, server/engines.py가
호출마다 이 run()에 위임한다. (spawn/persistent 내장 타입으로 안 되는 특수 연결일 때만 쓴다.)

- 표준 라이브러리만 사용. 외부 패키지 추가 금지.
- 반환은 반드시 각 페르소나의 출력 스키마 dict (prompts/*.md 및 CODEMAP §6 계약 표 참조).
"""
# import subprocess, json, tempfile, os


def run(persona, prompt_text, payload, attachments=None):
    """페르소나 프롬프트 + 입력 데이터를 실제 CLI/API로 보내고 JSON dict를 반환한다.

    persona: 프롬프트 파일 이름 (예: "persona-synthesis", "aux-title")
    prompt_text: _common.md + 해당 페르소나 md 를 합친 프롬프트 전문
    payload: 입력 데이터 dict (예: {"features": [{"feature_index", "row", ...}]})
    attachments: 이미지 파일 경로 리스트 (PL 검사 등, 없으면 None)
    반환: 페르소나 출력 스키마 dict (파서가 그대로 소비한다)

    예시(의사코드):
        prompt = prompt_text + "\\n\\n## 입력(JSON)\\n" + json.dumps(payload, ensure_ascii=False)
        out = subprocess.run([...CLI...], input=prompt, capture_output=True, text=True).stdout
        return json.loads(_extract_json(out))
    """
    raise NotImplementedError("회사 CLI/API 호출로 채우세요 (adapters/engine_<name>.py)")
