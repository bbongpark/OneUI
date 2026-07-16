# -*- coding: utf-8 -*-
"""PLM 어댑터 예제 — 이 파일을 adapters/plm.py로 복사한 뒤 회사 PLM API 호출로 채운다.
파일이 adapters/plm.py로 존재하면 server/api.py의 api_plm_advance가 자동으로 이 advance()를 쓴다.
(없으면 코어가 pending→sent→in_progress→done mock으로 동작한다.)

- 표준 라이브러리만 사용(urllib.request 등). 외부 패키지 추가 금지.
- API 키·엔드포인트는 코드에 하드코딩하지 말고 환경변수나 config에서 읽을 것.
"""
# import urllib.request, json, os


def advance(action):
    """액션 아이템 하나를 실제 PLM에 반영하고, 바꿀 상태 필드만 dict로 반환한다.

    입력 action(dict): {
        "id", "feature_index", "action", "owner_dept", "due",
        "plm_status": "pending|sent|in_progress|done", "plm_id",
        "report_needed", "followup_scheduled"
    }
    반환(dict): {"plm_status": "...", "plm_id": "..."}  — 바꿀 필드만. 빈 dict면 변화 없음.

    예시 흐름(의사코드):
        if not action["plm_id"]:                       # 아직 PLM에 등록 전 → 생성
            res = _post(BASE + "/issues", {
                "title": action["action"], "assignee": action["owner_dept"],
                "due": action["due"], "ref": action["feature_index"],
            })
            return {"plm_status": "sent", "plm_id": res["issueId"]}
        else:                                          # 이미 등록됨 → 상태 폴링
            st = _get(BASE + "/issues/" + action["plm_id"])
            return {"plm_status": _map_state(st["state"])}   # PLM 상태 → 4단계로 매핑
    """
    raise NotImplementedError("회사 PLM API 호출로 채우세요 (adapters/plm.py)")


# def _map_state(plm_state):
#     return {"OPEN": "sent", "IN_PROGRESS": "in_progress", "CLOSED": "done"}.get(plm_state, "sent")
