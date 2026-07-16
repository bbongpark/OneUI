# -*- coding: utf-8 -*-
"""인입 — 취합 엑셀·발표 PPT 업로드 처리 (표준 라이브러리 파서 사용).
증분 규칙: 트리거 열이 바뀐 행만 재리뷰 대상(row_hash 갱신), 나머지는 캐시 유지.
재등록 감지: 다른 버전에서 rejected/defer된 동일 이름 Feature를 표시.
PPT: 슬라이드 텍스트에서 인덱스를 찾아 매핑. PNG 렌더링은 Office COM 필요
(scripts/ppt_to_png.ps1) — 텍스트 매핑은 여기서, 이미지는 회사 환경에서.
"""
import hashlib, json, os, re
from . import store, office


def _schema():
    return store.load(store.path("config", "excel_schema.json"), {})


def _hash(row):
    return hashlib.sha1(json.dumps(row, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def _prev_dropped(exclude_version):
    """다른 버전들의 rejected/defer 항목: {인덱스: '버전/인덱스'} — 같은 인덱스로 재등록을 감지한다."""
    out = {}
    for v in store.versions():
        if v == exclude_version:
            continue
        for f in store.load(store.dpath(v, "features.json"), {"features": []})["features"]:
            if f.get("decision") in ("rejected", "defer"):
                out.setdefault(f["feature_index"], "%s/%s" % (v, f["feature_index"]))
    return out


def ingest_excel(version, xlsx_path):
    sc = _schema()
    fields = sc.get("fields", {})
    idx_col = fields.get("feature_index", "인덱스")
    rows = office.xlsx_rows(xlsx_path, int(sc.get("header_row", 1)))
    if not rows:
        raise RuntimeError("엑셀에서 데이터 행을 찾지 못했습니다 (헤더 행 번호·시트 확인)")
    if idx_col not in rows[0]:
        raise RuntimeError("인덱스 열 '%s'를 찾을 수 없음 — 설정의 엑셀 스키마 매핑 확인" % idx_col)

    fp = store.dpath(version, "features.json")
    prev = {f["feature_index"]: f for f in (store.load(fp, {"features": []}) or {}).get("features", [])}
    trig = sc.get("review_trigger_columns", [])
    dropped = _prev_dropped(version)

    feats, n_new, n_changed, n_kept = [], 0, 0, 0
    for r in rows:
        idx = r.get(idx_col, "").strip()
        if not idx:
            continue
        h = _hash(r)
        pf = prev.get(idx)
        func = r.get(fields.get("function_name", ""), "")
        cat = r.get(fields.get("ai_category", ""), "")
        if pf is None:
            n_new += 1
            feats.append({
                "feature_index": idx,
                "name": "",                     # Feature 이름 열이 없다 — AI가 변경점을 요약해 채운다
                "function_name": func, "ai_category": cat,
                "row": r, "row_hash": h, "status": "ingested", "decision": None,
                "decision_conditions": [], "slides": [],
                "reregistered_from": dropped.get(idx),
                "input_changed": False})
        else:
            trig_changed = any((pf["row"].get(c, "") != r.get(c, "")) for c in trig) if trig else (pf["row_hash"] != h)
            pf = dict(pf, row=r, function_name=func, ai_category=cat)
            if trig_changed:
                pf["name"] = ""                 # 변경점이 바뀌었으면 제목도 다시 만든다
            if trig_changed:
                n_changed += 1
                pf["row_hash"] = h          # 해시 변경 → 리뷰 캐시 무효화
                pf["input_changed"] = pf["status"] in ("meeting_wait", "decided")
            else:
                n_kept += 1                  # 해시 유지 → 캐시 유지
            feats.append(pf)
        prev.pop(idx, None)

    removed = list(prev.keys())              # 갱신본에서 사라진 행 — 삭제하지 않고 보고만
    for idx in removed:
        feats.append(dict(prev[idx], missing_in_upload=True))

    for sub in ("slides", "references", "output"):
        os.makedirs(store.dpath(version, sub), exist_ok=True)
    store.save(fp, {"version": version, "readonly": False, "features": feats})
    for name, default in (("reviews.json", {"rev": 0, "items": {}}), ("pl_checks.json", {"rev": 0, "items": {}}),
                          ("schedule.json", {"rev": 0, "milestones": [], "slots": []}),
                          ("meetings.json", {"rev": 0, "items": []}), ("actions.json", {"rev": 0, "items": []})):
        if not os.path.exists(store.dpath(version, name)):
            store.save(store.dpath(version, name), default)

    # 새 열 감지 — 스키마가 아는 열(매핑·필수·트리거·관리) 밖의 열이 오면 관리 열 선택 안내
    known = set(fields.values()) | set(sc.get("required_columns", [])) | \
            set(sc.get("review_trigger_columns", [])) | set(sc.get("managed_columns", []))
    new_cols = [c for c in rows[0].keys() if c not in known]

    rereg = sum(1 for f in feats if f.get("reregistered_from"))
    store.notify("job", "엑셀 인입 (%s): 신규 %d · 변경 %d · 유지 %d%s%s" %
                 (version, n_new, n_changed, n_kept,
                  " · 재등록 감지 %d" % rereg if rereg else "",
                  " · 갱신본에 없음 %d" % len(removed) if removed else ""))
    return {"kind": "xlsx", "total": len(feats), "new": n_new, "changed": n_changed,
            "kept": n_kept, "reregistered": rereg, "missing": removed[:20],
            "columns": len(rows[0]), "all_columns": list(rows[0].keys()), "new_columns": new_cols,
            "managed_columns": sc.get("managed_columns", [])}


def ingest_ppt(version, pptx_path):
    """슬라이드 텍스트 → 인덱스 매핑. 이미지 렌더링은 회사에서 scripts/ppt_to_png.ps1."""
    slides = office.pptx_slide_texts(pptx_path)
    fp = store.dpath(version, "features.json")
    data = store.load(fp, None)
    if data is None:
        raise RuntimeError("이 버전에 엑셀이 아직 인입되지 않았습니다 — 엑셀부터 업로드하세요")
    idxs = {f["feature_index"] for f in data["features"]}
    fname = os.path.basename(pptx_path)
    mapped, unmapped = {}, []
    for num, text in slides:
        m = next((i for i in idxs if i and i in text), None)
        if m:
            mapped.setdefault(m, []).append({"slide": num, "text": text[:1500], "file": fname})
        else:
            unmapped.append({"slide": num, "file": fname, "text": text[:1500]})
    for f in data["features"]:
        if f["feature_index"] in mapped:
            f.setdefault("slides_text", [])
            f["slides_text"] = [s for s in f["slides_text"] if s.get("file") != fname] + mapped[f["feature_index"]]
    data.setdefault("unmapped_slides", [])
    data["unmapped_slides"] = [u for u in data["unmapped_slides"] if u.get("file") != fname] + unmapped
    # 사람 확인 절차: PPT가 새로 들어오면 매핑은 미확정 상태 — 확정 전 PL 검사 불가
    data["mapping"] = {"confirmed": False, "confirmed_by": "", "at": ""}
    store.save(fp, data)
    store.notify("job", "PPT 인입 (%s): %s — Feature %d건 매핑, 미매핑 슬라이드 %d" %
                 (version, fname, len(mapped), len(unmapped)))
    return {"kind": "pptx", "mapped_features": len(mapped), "mapped_slides": sum(len(v) for v in mapped.values()),
            "unmapped": len(unmapped),
            "note": "슬라이드 이미지(PNG) 렌더링은 Office가 있는 환경에서 scripts/ppt_to_png.ps1 실행"}
