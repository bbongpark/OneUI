# -*- coding: utf-8 -*-
"""등급 하드룰 — AI보다 먼저 적용된다.

순서: ① 자료 보완 필요(DOC) → ② 단순 공유(SHARE) → ③ 나머지만 AI가 P0/P1/P2 판정.
여기서 걸린 건은 AI 페르소나를 호출하지 않는다(판정이 확정이므로 토큰도 아낀다).
규칙은 config/grade_rules.json — 회사에서 실제 엑셀을 보고 채운다.
"""
from . import store

PLACEHOLDERS = {"-", "–", "—", "tbd", "n/a", "na", "미정", "추후", "없음", "예정"}


def rules():
    return store.load(store.path("config", "grade_rules.json"), {})


def _val(row, col):
    return str((row or {}).get(col, "") or "").strip()


def _is_blank(v):
    return not v or v.lower() in PLACEHOLDERS


def _match(row, rule):
    col = rule.get("column")
    if not col:
        return False
    v = _val(row, col)
    op = rule.get("op", "equals")
    vals = rule.get("values", [])
    if op == "empty":
        return _is_blank(v)
    if op == "not_empty":
        return not _is_blank(v)
    if _is_blank(v):
        return False
    if op == "equals":
        return v == rule.get("value", "")
    if op == "in":
        return v in vals
    if op == "contains":
        return any(str(x) in v for x in vals) if vals else str(rule.get("value", "")) in v
    if op == "regex":
        import re
        try:
            return bool(re.search(rule.get("value", ""), v))
        except re.error:
            return False
    return False


def hard_grade(row):
    """하드룰로 확정되는 등급을 돌려준다. 해당 없으면 None (→ AI가 P0/P1/P2 판정).
    반환: (등급, 사유) 또는 (None, None)"""
    r = rules()
    sc = store.load(store.path("config", "excel_schema.json"), {})

    # ① 자료 보완 필요 — 변경점이 템플릿 요건을 못 채우면 판정 불가
    d = r.get("doc_fix") or {}
    if d.get("enabled"):
        col = d.get("column") or (sc.get("fields") or {}).get("change_summary")
        if col:
            v = _val(row, col)
            if _is_blank(v):
                return "DOC", "'%s' 미기입" % col if not v else "'%s'이 자리채움 값('%s')" % (col, v)
            if len(v) < int(d.get("min_length") or 0):
                return "DOC", "'%s'이 %d자로 너무 짧음 (최소 %d자)" % (col, len(v), d["min_length"])
            missing = [k for k in (d.get("require_all") or []) if k not in v]
            if missing:
                return "DOC", "'%s'에 %s 항목이 없음 (변경점 템플릿 미준수)" % (col, "·".join(missing))

    # ② 단순 공유 — 논의도 결정도 필요 없는 건
    s = r.get("share") or {}
    if s.get("enabled"):
        for rule in s.get("rules", []):
            if rule.get("enabled") and _match(row, rule):
                return "SHARE", rule.get("name") or "단순 공유 규칙 일치"

    return None, None
