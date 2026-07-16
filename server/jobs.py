# -*- coding: utf-8 -*-
"""작업 큐 — 모든 AI 작업을 직렬 실행. 질의는 전용 슬롯(즉시 실행)."""
import threading, queue, traceback, json, os, hashlib
from . import store, engines

_q = queue.Queue()
_state = {"current": None, "log": [], "done": []}
_lock = threading.Lock()


def log(msg):
    with _lock:
        _state["log"].append({"at": store.now(), "msg": msg})
        del _state["log"][:-300]


def snapshot():
    with _lock:
        return {"current": _state["current"], "pending": [j["label"] for j in list(_q.queue)],
                "log": _state["log"][-80:], "done": _state["done"][-30:]}


def enqueue(kind, version, user, params=None):
    label = "%s (%s, 요청: %s)" % (KIND_LABEL.get(kind, kind), version or "-", user)
    _q.put({"kind": kind, "version": version, "user": user, "params": params or {}, "label": label})
    log("큐 등록: " + label)
    return label


def start():
    threading.Thread(target=_worker, daemon=True).start()


def _worker():
    while True:
        job = _q.get()
        with _lock:
            _state["current"] = job["label"]
        log("실행 시작: " + job["label"])
        try:
            HANDLERS[job["kind"]](job)
            log("완료: " + job["label"])
            with _lock:
                _state["done"].insert(0, {"at": store.now(), "label": job["label"], "ok": True})
        except Exception as e:
            log("실패: %s — %s" % (job["label"], e))
            traceback.print_exc()
            store.notify("job", "작업 실패: %s — %s" % (job["label"], str(e)[:120]))
            with _lock:
                _state["done"].insert(0, {"at": store.now(), "label": job["label"], "ok": False})
        finally:
            with _lock:
                _state["current"] = None


def _prompt(name):
    fp = store.path("prompts", name + ".md")
    common = ""
    cfp = store.path("prompts", "_common.md")
    if os.path.exists(cfp):
        common = open(cfp, encoding="utf-8").read() + "\n\n---\n\n"
    return common + open(fp, encoding="utf-8").read()


def _prompt_hash(name):
    try:
        return hashlib.sha1(open(store.path("prompts", name + ".md"), "rb").read()).hexdigest()[:8]
    except OSError:
        return "?"


def _features(version):
    return store.load(store.dpath(version, "features.json"), {"features": []})


def _row_view(row):
    """페르소나에게 전달할 행 — 관리 열(managed_columns)만. 미지정이면 전체.
    논리 필드로 매핑된 열은 항상 포함."""
    sc = store.load(store.path("config", "excel_schema.json"), {})
    cols = sc.get("managed_columns") or []
    if not cols:
        return row
    keep = set(cols) | {v for v in (sc.get("fields") or {}).values() if v}
    return {k: v for k, v in row.items() if k in keep}


def _batches(items, version):
    n = (store.load(store.path("config", "engines.json"), {}) or {}).get("batch_size", 15)
    for i in range(0, len(items), n):
        yield items[i:i + n]


# ---------- 파이프라인 작업들 ----------

def job_review(job):
    """개별 페르소나 4종 리뷰 — 캐시(입력 해시+프롬프트 해시) 존중, 변경분만."""
    v = job["version"]
    feats = _features(v)["features"]
    rv_fp = store.dpath(v, "reviews.json")
    personas = ["persona-experience-planning", "persona-ux", "persona-dev", "persona-cxi"]
    only = job["params"].get("personas") or personas
    reviews = store.load(rv_fp, {"rev": 0, "items": {}})
    targets = [f for f in feats if f["status"] != "decided" and f.get("decision") != "rejected"]
    for pname in only:
        key = pname.replace("persona-", "").replace("experience-planning", "experience_planning")
        ph = _prompt_hash(pname)
        todo = []
        for f in targets:
            it = reviews["items"].get(f["feature_index"], {})
            done = it.get("personas", {}).get(key)
            if done and it.get("input_hash") == f["row_hash"] and it.get("prompt_hash_" + key) == ph:
                continue
            todo.append(f)
        log("%s: 대상 %d건 (캐시 제외)" % (pname, len(todo)))
        for batch in _batches(todo, v):
            payload = {"features": [{"feature_index": f["feature_index"], "row": _row_view(f["row"])} for f in batch]}
            out = engines.run(pname, _prompt(pname), payload)
            def apply(obj):
                for r in out.get("results", []):
                    it = obj["items"].setdefault(r["feature_index"], {"personas": {}})
                    it["personas"][key] = {k: r.get(k) for k in
                                           ("grade", "recommendation", "conditions", "rationale", "key_question", "status", "reason")}
                    ft = next((x for x in batch if x["feature_index"] == r["feature_index"]), None)
                    if ft:
                        it["input_hash"] = ft["row_hash"]
                    it["prompt_hash_" + key] = ph
                return obj
            reviews = store.update(rv_fp, apply, {"rev": 0, "items": {}})
    # 상태 갱신
    def fst(obj):
        for f in obj["features"]:
            it = reviews["items"].get(f["feature_index"], {})
            if f["status"] in ("ingested", "reviewing"):
                f["status"] = "reviewing" if len(it.get("personas", {})) < 4 else f["status"]
        return obj
    store.update(store.dpath(v, "features.json"), fst)
    store.notify("job", "개별 페르소나 리뷰 완료 (%s)" % v)
    enqueue("synthesis", v, job["user"])


def job_synthesis(job):
    v = job["version"]
    rv_fp = store.dpath(v, "reviews.json")
    reviews = store.load(rv_fp, {"rev": 0, "items": {}})
    feats = _features(v)["features"]
    ready = [f for f in feats if len(reviews["items"].get(f["feature_index"], {}).get("personas", {})) == 4
             and f.get("decision") != "rejected"]
    for batch in _batches(ready, v):
        payload = {"features": [{"feature_index": f["feature_index"],
                                 "personas": reviews["items"][f["feature_index"]]["personas"]} for f in batch]}
        out = engines.run("persona-synthesis", _prompt("persona-synthesis"), payload)
        def apply(obj):
            for r in out.get("results", []):
                it = obj["items"].setdefault(r["feature_index"], {})
                if "override" in it:  # 사람 오버라이드 존중 — 값은 두고 AI 원판정만 갱신
                    r["overridden"] = True
                it["synthesis"] = r
            return obj
        reviews = store.update(rv_fp, apply, {"rev": 0, "items": {}})
    def fst(obj):
        for f in obj["features"]:
            it = reviews["items"].get(f["feature_index"], {})
            if it.get("synthesis") and f["status"] in ("ingested", "reviewing"):
                f["status"] = "meeting_wait"
        return obj
    store.update(store.dpath(v, "features.json"), fst)
    nh = sum(1 for i in reviews["items"].values() if (i.get("synthesis") or {}).get("status") == "needs_human")
    store.notify("job", "종합 판정 완료 (%s)%s" % (v, " — 사람 확인 필요 %d건" % nh if nh else ""))


def job_pl(job):
    v = job["version"]
    feats = [f for f in _features(v)["features"] if f.get("decision") != "rejected"]
    sched = store.load(store.dpath(v, "schedule.json"), {})
    for batch in _batches(feats, v):
        payload = {"features": [{"feature_index": f["feature_index"], "row": _row_view(f["row"]), "slides": f["slides"]} for f in batch],
                   "milestones": sched.get("milestones", []), "today": store.now()[:10],
                   "required_columns": (store.load(store.path("config", "excel_schema.json"), {}) or {}).get("required_columns", [])}
        atts = [store.dpath(v, "slides", s) for f in batch for s in f["slides"]]
        out = engines.run("persona-pl", _prompt("persona-pl"), payload, atts)
        def apply(obj):
            for r in out.get("results", []):
                obj["items"][r["feature_index"]] = r
            return obj
        store.update(store.dpath(v, "pl_checks.json"), apply, {"rev": 0, "items": {}})
    items = store.load(store.dpath(v, "pl_checks.json"), {"items": {}})["items"]
    bad = sum(1 for x in items.values() if not x.get("ready"))
    store.notify("job", "PL 검사 완료 (%s) — 미준비 %d건" % (v, bad))


def job_schedule(job):
    """소요시간 추정 → 슬롯 배정 (P2 제외, 후속 보고 최우선).
    슬롯은 회의 화면에서 사람이 직접 관리 — 배정은 존재하는 슬롯을 채우기만 한다."""
    v = job["version"]
    sch = store.load(store.dpath(v, "schedule.json"), {})
    existing_slots = sch.get("slots") or []
    if not existing_slots:
        raise RuntimeError("슬롯이 없습니다 — 회의 화면에서 슬롯을 먼저 추가하세요")
    reviews = store.load(store.dpath(v, "reviews.json"), {"items": {}})["items"]
    feats = _features(v)["features"]
    cand = [f for f in feats if (reviews.get(f["feature_index"], {}).get("synthesis") or {}).get("final_grade") in ("P0", "P1")
            and f.get("decision") is None]
    est = engines.run("aux-duration-estimate", _prompt("aux-duration-estimate"),
                      {"features": [{"feature_index": f["feature_index"], "row": _row_view(f["row"]),
                                     "synthesis": reviews.get(f["feature_index"], {}).get("synthesis")} for f in cand]})
    emap = {r["feature_index"]: r["est_min"] for r in est.get("results", [])}
    order = sorted(cand, key=lambda f: (0 if (reviews.get(f["feature_index"], {}).get("synthesis") or {}).get("final_grade") == "P0" else 1,
                                        f["department"]))
    followups = job["params"].get("followups", [])  # [{feature_index, action_id}]
    # 수동 관리된 슬롯 구조 유지, 배정만 새로 채움
    slots = [{"date": s["date"], "time": s["time"], "items": [],
              "capacity_min": s.get("capacity_min", 60)} for s in existing_slots]
    queue_items = ([{"feature_index": x["feature_index"], "est_min": emap.get(x["feature_index"], 5), "followup": True}
                    for x in followups] +
                   [{"feature_index": f["feature_index"], "est_min": emap.get(f["feature_index"], 5), "followup": False}
                    for f in order])
    si = 0
    unassigned = []
    for item in queue_items:
        placed = False
        while si < len(slots):
            used = sum(i["est_min"] for i in slots[si]["items"])
            if used + item["est_min"] <= slots[si]["capacity_min"]:
                slots[si]["items"].append(dict(item, predicted=None))
                placed = True
                break
            si += 1
        if not placed:
            unassigned.append(item["feature_index"])
    def apply(obj):
        obj["slots"] = slots
        obj["unassigned"] = unassigned
        return obj
    store.update(store.dpath(v, "schedule.json"), apply, {"rev": 0, "milestones": [], "slots": []})
    store.notify("meeting", "회의 일정 배정 완료 (%s) — 슬롯 %d개, 미배정 %d건" % (v, len(slots), len(unassigned)))
    enqueue("predict", v, job["user"])


def job_predict(job):
    """④-2 SW담당 임원 예상 판정."""
    v = job["version"]
    sched = store.load(store.dpath(v, "schedule.json"), {"slots": []})
    reviews = store.load(store.dpath(v, "reviews.json"), {"items": {}})["items"]
    plc = store.load(store.dpath(v, "pl_checks.json"), {"items": {}})["items"]
    fmap = {f["feature_index"]: f for f in _features(v)["features"]}
    idxs = [i["feature_index"] for s in sched["slots"] for i in s["items"]]
    feats = [{"feature_index": i, "row": _row_view(fmap[i]["row"]),
              "personas": reviews.get(i, {}).get("personas", {}),
              "synthesis": reviews.get(i, {}).get("synthesis"),
              "pl": plc.get(i)} for i in idxs if i in fmap]
    pred_map = {}
    for batch in _batches(feats, v):
        out = engines.run("persona-sw-director", _prompt("persona-sw-director"), {"features": batch})
        for r in out.get("results", []):
            pred_map[r["feature_index"]] = r
    def apply(obj):
        for s in obj["slots"]:
            for i in s["items"]:
                if i["feature_index"] in pred_map:
                    i["predicted"] = pred_map[i["feature_index"]]
        return obj
    store.update(store.dpath(v, "schedule.json"), apply)
    store.notify("meeting", "예상 판정 완료 (%s) — 안건 %d건" % (v, len(pred_map)))


def job_minutes(job):
    """회의록 추출 (확정은 별도 API)."""
    v = job["version"]
    p = job["params"]
    feats = _features(v)["features"]
    out = engines.run("aux-minutes-extract", _prompt("aux-minutes-extract"),
                      {"minutes": p["minutes"],
                       "features": [{"feature_index": f["feature_index"], "name": f["name"]} for f in feats]})
    def apply(obj):
        items = obj.setdefault("items", [])
        m = next((x for x in items if x["id"] == p["meeting_id"]), None)
        if m is None:
            m = {"id": p["meeting_id"], "date": store.now()[:10], "time": "", "title": p.get("title", "리뷰 회의"),
                 "confirmed": False}
            items.append(m)
        m["minutes_raw"] = p["minutes"]
        m["extracted"] = out
        m["confirmed"] = False
        return obj
    store.update(store.dpath(v, "meetings.json"), apply, {"rev": 0, "items": []})
    store.notify("meeting", "회의록 추출 완료 — 결정 %d건, 액션 %d건 (확인 대기)" %
                 (len(out.get("decisions", [])), len(out.get("actions", []))))


def job_plm_judge(job):
    """PLM 완료 결과의 보고 필요 판단."""
    v = job["version"]
    acts = store.load(store.dpath(v, "actions.json"), {"items": []})["items"]
    done = [a for a in acts if a["plm_status"] == "done" and a.get("report_needed") is None]
    if not done:
        log("판단 대상 없음")
        return
    out = engines.run("aux-plm-report-judge", _prompt("aux-plm-report-judge"), {"actions": done})
    jmap = {r["action_id"]: r for r in out.get("results", [])}
    def apply(obj):
        for a in obj["items"]:
            if a["id"] in jmap:
                a["report_needed"] = jmap[a["id"]]["report_needed"]
                a["report_rationale"] = jmap[a["id"]]["rationale"]
        return obj
    store.update(store.dpath(v, "actions.json"), apply)
    need = sum(1 for r in jmap.values() if r["report_needed"])
    store.notify("followup", "PLM 결과 판단 완료 — 후속 보고 필요 %d건" % need)


def job_insight(job):
    v = job["version"]
    feats = _features(v)["features"]
    reviews = store.load(store.dpath(v, "reviews.json"), {"items": {}})["items"]
    refs = []
    rdir = store.dpath(v, "references")
    if os.path.isdir(rdir):
        for fn in os.listdir(rdir):
            if fn.endswith((".md", ".txt")):
                refs.append({"file": fn, "text": open(os.path.join(rdir, fn), encoding="utf-8").read()[:8000]})
    out = engines.run("aux-insight-report", _prompt("aux-insight-report"),
                      {"features": [{"feature_index": f["feature_index"], "name": f["name"],
                                     "department": f["department"],
                                     "synthesis": reviews.get(f["feature_index"], {}).get("synthesis")} for f in feats],
                       "references": refs})
    open(store.dpath(v, "insight.md"), "w", encoding="utf-8").write(out.get("markdown", ""))
    store.notify("job", "인사이트 리포트 생성 완료 (%s)" % v)


def job_golden(job):
    gs_fp = store.path("golden", "golden_set.json")
    gs = store.load(gs_fp, {"items": [], "runs": []})
    feats = [{"feature_index": g["feature_index"], "row": g["row"]} for g in gs["items"]]
    per = {}
    for pname in ["persona-experience-planning", "persona-ux", "persona-dev", "persona-cxi"]:
        out = engines.run(pname, _prompt(pname), {"features": feats})
        key = pname.replace("persona-", "").replace("experience-planning", "experience_planning")
        for r in out.get("results", []):
            per.setdefault(r["feature_index"], {})[key] = r
    syn = engines.run("persona-synthesis", _prompt("persona-synthesis"),
                      {"features": [{"feature_index": i, "personas": p} for i, p in per.items()]})
    smap = {r["feature_index"]: r for r in syn.get("results", [])}
    match_g = match_r = 0
    detail = []
    for g in gs["items"]:
        s = smap.get(g["feature_index"], {})
        mg = s.get("final_grade") == g["truth"]["final_grade"]
        mr = s.get("final_recommendation") == g["truth"]["final_recommendation"]
        match_g += mg
        match_r += mr
        detail.append({"feature_index": g["feature_index"], "truth": g["truth"],
                       "got": {"final_grade": s.get("final_grade"), "final_recommendation": s.get("final_recommendation")},
                       "grade_match": mg, "rec_match": mr})
    n = max(len(gs["items"]), 1)
    run = {"at": store.now(), "engine": engines.engine_for("persona-synthesis")[0],
           "grade_acc": round(match_g / n * 100), "rec_acc": round(match_r / n * 100), "detail": detail}
    def apply(obj):
        obj.setdefault("runs", []).insert(0, run)
        del obj["runs"][20:]
        return obj
    store.update(gs_fp, apply)
    store.notify("persona", "골든셋 실행 완료 — 등급 일치 %d%%, 권고 일치 %d%%" % (run["grade_acc"], run["rec_acc"]))


def job_report_ppt(job):
    """보고 PPT 생성 — 회사에서는 scripts/ppt_fill.ps1 호출. 뼈대에서는 요약 md 생성."""
    v = job["version"]
    feats = _features(v)["features"]
    reviews = store.load(store.dpath(v, "reviews.json"), {"items": {}})["items"]
    kinds = {"aggregate": "취합완료 보고", "progress": "진행보고"}
    kind = job["params"].get("kind", "aggregate")
    syn = [reviews.get(f["feature_index"], {}).get("synthesis") for f in feats]
    dist = {g: sum(1 for s in syn if s and s.get("final_grade") == g) for g in ("P0", "P1", "P2")}
    body = ("# %s (%s) — 데모 산출물\n\n생성: %s\n\n" % (kinds[kind], v, store.now()) +
            "| 항목 | 값 |\n|---|---|\n| 전체 Feature | %d |\n| P0 | %d |\n| P1 | %d |\n| P2(서면) | %d |\n\n" %
            (len(feats), dist["P0"], dist["P1"], dist["P2"]) +
            "> 실제 PPT 생성은 회사에서 templates/에 자리표시자 템플릿 등록 후 scripts/ppt_fill.ps1로 수행.\n")
    fn = "%s_%s.md" % (kind, store.now().replace(":", "").replace("-", "")[:13])
    open(store.dpath(v, "output", fn), "w", encoding="utf-8").write(body)
    store.notify("job", "%s 산출물 생성 완료 — output/%s" % (kinds[kind], fn))


def job_ppt_render(job):
    """업로드된 PPT를 슬라이드 PNG로 렌더링(PowerPoint COM) 후 매핑.
    Office가 없으면 우아하게 건너뜀 — 텍스트 매핑은 이미 인입 단계에서 완료됨."""
    import subprocess
    v = job["version"]
    pptx = job["params"]["file"]
    fname = os.path.basename(pptx)
    out_dir = store.dpath(v, "slides")
    script = store.path("scripts", "ppt_render_one.ps1")
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                            "-File", script, "-Pptx", pptx, "-OutDir", out_dir],
                           capture_output=True, text=True, timeout=600)
        ok = r.returncode == 0 and "OK" in (r.stdout or "")
    except Exception:
        ok = False
    if not ok:
        store.notify("job", "PPT 이미지 렌더링 건너뜀 (%s) — 이 PC에 PowerPoint(Office)가 없거나 실패. "
                            "텍스트 매핑은 유지됨. 회사 PC에서 재업로드하면 자동 렌더링됩니다." % fname)
        log("렌더링 불가 — 텍스트 매핑만 유지: " + fname)
        return
    base = re.sub(r"[^\w\-가-힣]", "_", os.path.splitext(fname)[0])
    def apply(obj):
        for f in obj["features"]:
            nums = [s["slide"] for s in f.get("slides_text", []) if s.get("file") == fname]
            for n in sorted(nums):
                png = "%s_slide%d.png" % (base, n)
                if os.path.exists(os.path.join(out_dir, png)) and png not in f["slides"]:
                    f["slides"].append(png)
        return obj
    store.update(store.dpath(v, "features.json"), apply)
    mapped = sum(1 for f in store.load(store.dpath(v, "features.json"), {"features": []})["features"]
                 if any(s.startswith(base) for s in f["slides"]))
    store.notify("job", "PPT 이미지 렌더링 완료 (%s) — Feature %d건에 슬라이드 이미지 연결" % (fname, mapped))


def job_selftest(job):
    result = engines.selftest()
    def apply(obj):
        obj["selftest"] = result
        obj["selftest_at"] = store.now()
        return obj
    store.update(store.dpath("engine_status.json"), apply, {"rev": 0})
    store.notify("job", "엔진 자가진단 완료 (%s) — %s" %
                 (result["engine"], "전체 통과" if result["all_passed"] else "실패 항목 있음"))


KIND_LABEL = {"review": "페르소나 리뷰", "synthesis": "종합 판정", "pl": "PL 검사", "schedule": "회의 일정 배정",
              "predict": "SW담당 예상 판정", "minutes": "회의록 추출", "plm_judge": "PLM 결과 판단",
              "insight": "인사이트 리포트", "golden": "골든셋 실행", "report_ppt": "보고 산출물 생성",
              "selftest": "엔진 자가진단", "ppt_render": "PPT 이미지 렌더링"}
HANDLERS = {"review": job_review, "synthesis": job_synthesis, "pl": job_pl, "schedule": job_schedule,
            "predict": job_predict, "minutes": job_minutes, "plm_judge": job_plm_judge,
            "insight": job_insight, "golden": job_golden, "report_ppt": job_report_ppt,
            "selftest": job_selftest, "ppt_render": job_ppt_render}


# ---------- 질의 (전용 슬롯 — 큐 우회, 동기 실행) ----------

def run_query(question, versions_all, mode="basic"):
    """2단계: 코드가 키워드로 후보 청크 추출 → 엔진 1회 호출."""
    words = [w for w in question.replace("?", " ").replace(",", " ").split() if len(w) >= 2][:8]
    chunks = []
    for v in versions_all:
        feats = store.load(store.dpath(v, "features.json"), {"features": []})["features"]
        for f in feats:
            text = json.dumps(f["row"], ensure_ascii=False)
            if any(w in text for w in words):
                chunks.append({"version": v, "feature_index": f["feature_index"], "kind": "feature",
                               "ref": "features.json", "text": text[:500]})
        meets = store.load(store.dpath(v, "meetings.json"), {"items": []})["items"]
        for m in meets:
            if any(w in m.get("minutes_raw", "") for w in words):
                chunks.append({"version": v, "feature_index": "", "kind": "meeting",
                               "ref": m["id"] + " " + m.get("date", ""), "text": m["minutes_raw"][:600]})
    chunks = chunks[:12]
    out = engines.run("aux-query", _prompt("aux-query"), {"question": question, "chunks": chunks})
    out["candidates"] = len(chunks)
    return out
