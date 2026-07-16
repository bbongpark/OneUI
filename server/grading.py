# -*- coding: utf-8 -*-
"""등급 하드룰.

판정 순서:
  ① 자료 보완 필요(DOC) — 변경점이 템플릿을 못 채우면. AI를 부르기 전에 거른다(판단 불가 + 토큰 절약).
  ② AI 종합 에이전트가 P0/P1/P2 판정
  ③ P2 중 단순 공유(SHARE) — 하드룰로 서면보고에서 공유로 내린다.

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


def doc_check(row):
    """① AI 앞단 — 변경점이 부실해 판정 자체가 불가능한가. (사유) 또는 None"""
    d = (rules().get("doc_fix") or {})
    if not d.get("enabled"):
        return None
    sc = store.load(store.path("config", "excel_schema.json"), {})
    col = d.get("column") or (sc.get("fields") or {}).get("change_summary")
    if not col:
        return None
    v = _val(row, col)
    if not v:
        return "'%s' 미기입" % col
    if _is_blank(v):
        return "'%s'이 자리채움 값('%s')" % (col, v)
    if len(v) < int(d.get("min_length") or 0):
        return "'%s'이 %d자로 너무 짧음 (최소 %d자)" % (col, len(v), d["min_length"])
    missing = [k for k in (d.get("require_all") or []) if k not in v]
    if missing:
        return "'%s'에 %s 항목이 없음 (변경점 템플릿 미준수)" % (col, "·".join(missing))
    return None


def share_check(row):
    """③ P2 판정 이후 — 서면보고(P2) 중 단순 공유로 내릴 건인가. (사유) 또는 None"""
    s = (rules().get("share") or {})
    if not s.get("enabled"):
        return None
    for rule in s.get("rules", []):
        if rule.get("enabled") and _match(row, rule):
            return rule.get("name") or "단순 공유 규칙 일치"
    return None
