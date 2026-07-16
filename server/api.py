# -*- coding: utf-8 -*-
"""HTTP API + 정적 서빙 — 표준 라이브러리 http.server 기반."""
import base64, json, os, re, shutil, mimetypes, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from . import store, jobs, office, ingest

WEB = store.path("web")
mimetypes.add_type("application/javascript", ".js")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # 콘솔 소음 억제

    # ---------- helpers ----------
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, fp, download=False):
        if not os.path.isfile(fp):
            return self._json({"error": "not found"}, 404)
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        with open(fp, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text") else ""))
        self.send_header("Cache-Control", "no-cache")  # 업데이트 배포 시 20명 브라우저의 구버전 JS 캐시 방지
        if download:
            self.send_header("Content-Disposition", "attachment; filename=\"%s\"" %
                             urllib.parse.quote(os.path.basename(fp)))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n).decode("utf-8")) if n else {}

    # ---------- GET ----------
    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path, q = p.path, urllib.parse.parse_qs(p.query)
        try:
            if path == "/" or path == "/index.html":
                return self._file(os.path.join(WEB, "index.html"))
            if path.startswith(("/css/", "/js/", "/assets/")):
                fp = os.path.normpath(os.path.join(WEB, path.lstrip("/")))
                if fp.startswith(WEB):
                    return self._file(fp)
                return self._json({"error": "forbidden"}, 403)
            m = re.match(r"^/slides/([^/]+)/([^/]+)$", path)
            if m:
                return self._file(store.dpath(m.group(1), "slides", m.group(2)))
            m = re.match(r"^/templates/(.+)$", path)
            if m:
                fp = os.path.normpath(store.path("templates", urllib.parse.unquote(m.group(1))))
                if fp.startswith(store.path("templates")):
                    return self._file(fp, download=True)
                return self._json({"error": "forbidden"}, 403)
            if path == "/api/bootstrap":
                return self._json(api_bootstrap())
            m = re.match(r"^/api/version/([^/]+)$", path)
            if m:
                return self._json(api_version(m.group(1)))
            if path == "/api/queue":
                return self._json(jobs.snapshot())
            if path == "/api/notifications":
                return self._json(store.load(store.dpath("notifications.json"), {"items": []}))
            if path == "/api/usage":
                return self._json(store.load(store.dpath("usage.json"), {}))
            if path == "/api/prompts":
                return self._json(api_prompts_list())
            m = re.match(r"^/api/prompts/([\w\-]+)$", path)
            if m:
                return self._json(api_prompt_get(m.group(1)))
            if path == "/api/golden":
                return self._json(store.load(store.path("golden", "golden_set.json"), {"items": [], "runs": []}))
            m = re.match(r"^/api/config/([\w]+)$", path)
            if m and m.group(1) in CONFIG_FILES:
                return self._json(store.load(store.path("config", m.group(1) + ".json"), {}))
            if path == "/api/engine_status":
                return self._json(store.load(store.dpath("engine_status.json"), {}))
            m = re.match(r"^/api/insight/([^/]+)$", path)
            if m:
                fp = store.dpath(m.group(1), "insight.md")
                return self._json({"markdown": open(fp, encoding="utf-8").read() if os.path.exists(fp) else ""})
            m = re.match(r"^/api/output/([^/]+)$", path)
            if m:
                od = store.dpath(m.group(1), "output")
                files = sorted(os.listdir(od), reverse=True) if os.path.isdir(od) else []
                return self._json({"files": files})
            m = re.match(r"^/api/output/([^/]+)/(.+)$", path)
            if m:
                return self._file(store.dpath(m.group(1), "output", m.group(2)), download=True)
            return self._json({"error": "not found"}, 404)
        except Exception as e:
            return self._json({"error": str(e)}, 500)

    # ---------- POST ----------
    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            b = self._body()
            if path == "/api/login":
                return self._json(api_login(b))
            if path == "/api/run":
                return self._json(api_run(b))
            if path == "/api/override":
                return self._json(api_override(b))
            if path == "/api/schedule/move":
                return self._json(api_schedule_move(b))
            if path == "/api/schedule/slot":
                return self._json(api_schedule_slot(b))
            if path == "/api/schedule/est":
                return self._json(api_schedule_est(b))
            if path == "/api/meetings/confirm":
                return self._json(api_meetings_confirm(b))
            if path == "/api/plm/advance":
                return self._json(api_plm_advance(b))
            if path == "/api/followup":
                return self._json(api_followup(b))
            if path == "/api/query":
                return self._json(api_query(b))
            if path == "/api/notifications/read":
                return self._json(api_notif_read(b))
            m = re.match(r"^/api/config/([\w]+)$", path)
            if m:
                return self._json(api_config_save(m.group(1), b))
            if path == "/api/golden/upload":
                return self._json(api_golden_upload(b))
            if path == "/api/ingest/upload":
                return self._json(api_ingest_upload(b))
            if path == "/api/mapping/assign":
                return self._json(api_mapping_assign(b))
            if path == "/api/mapping/confirm":
                return self._json(api_mapping_confirm(b))
            if path == "/api/golden/delete":
                return self._json(api_golden_delete(b))
            m = re.match(r"^/api/prompts/([\w\-]+)$", path)
            if m:
                return self._json(api_prompt_save(m.group(1), b))
            return self._json({"error": "not found"}, 404)
        except store.ConflictError as e:
            return self._json({"error": "conflict", "detail": str(e)}, 409)
        except Exception as e:
            return self._json({"error": str(e)}, 500)


# ================= API 구현 =================

def api_bootstrap():
    users = store.load(store.path("config", "users.json"), {"users": []})
    eng = store.load(store.path("config", "engines.json"), {})
    sc = store.load(store.path("config", "excel_schema.json"), {})
    return {"versions": store.versions(), "users": users,
            "managed_columns": sc.get("managed_columns", []),
            "dev_done_rule": sc.get("dev_done_rule", {}),
            "engine": {"default": eng.get("default_engine"), "names": list((eng.get("engines") or {}).keys())}}


def api_version(v):
    return {"features": store.load(store.dpath(v, "features.json"), {"features": []}),
            "reviews": store.load(store.dpath(v, "reviews.json"), {"rev": 0, "items": {}}),
            "pl_checks": store.load(store.dpath(v, "pl_checks.json"), {"rev": 0, "items": {}}),
            "schedule": store.load(store.dpath(v, "schedule.json"), {"rev": 0, "milestones": [], "slots": []}),
            "meetings": store.load(store.dpath(v, "meetings.json"), {"rev": 0, "items": []}),
            "actions": store.load(store.dpath(v, "actions.json"), {"rev": 0, "items": []}),
            "pred_stats": store.load(store.dpath(v, "prediction_stats.json"), {"runs": []})}


def api_login(b):
    cfg = store.load(store.path("config", "users.json"), {"users": [], "allow_unknown": True, "unknown_role": "member"})
    name = (b.get("name") or "").strip()
    if not name:
        raise RuntimeError("이름을 입력하세요")
    u = next((x for x in cfg["users"] if x["name"] == name), None)
    if u is None:
        if not cfg.get("allow_unknown"):
            raise RuntimeError("등록되지 않은 사용자")
        u = {"name": name, "role": cfg.get("unknown_role", "member")}
    return {"name": u["name"], "role": u["role"]}


def api_run(b):
    kind, version, user = b["kind"], b.get("version"), b.get("user", "?")
    feats = store.load(store.dpath(version or "", "features.json"), None) if version else None
    if kind == "pl" and feats and feats.get("mapping") and not feats["mapping"].get("confirmed"):
        raise RuntimeError("PPT 매핑이 아직 확정되지 않았습니다 — 리뷰 보드의 'PPT 매핑 확인'에서 검토·확정 후 실행하세요")
    if version and (feats or {}).get("readonly"):
        raise RuntimeError("지난 버전은 읽기 전용입니다")
    label = jobs.enqueue(kind, version, user, b.get("params"))
    return {"queued": label}


def api_override(b):
    v, idx = b["version"], b["feature_index"]
    fp = store.dpath(v, "reviews.json")
    def fn(obj):
        it = obj["items"].setdefault(idx, {})
        syn = it.setdefault("synthesis", {})
        hist = it.setdefault("history", [])
        for field in ("final_grade", "final_recommendation"):
            if b.get(field) and b[field] != syn.get(field):
                hist.append({"field": field, "from": syn.get(field), "to": b[field],
                             "by": b.get("user", "?"), "reason": b.get("reason", ""), "at": store.now()})
                syn[field] = b[field]
                it["override"] = {"field": field, "to": b[field], "by": b.get("user", "?"),
                                  "reason": b.get("reason", ""), "at": store.now()}
        if syn.get("status") == "needs_human" and b.get("resolve"):
            syn["status"] = "ok"
        return obj
    obj = store.update(fp, fn, base_rev=b.get("base_rev"))
    store.notify("override", "판정 수정: %s/%s → %s (%s)" %
                 (v, idx, b.get("final_grade") or b.get("final_recommendation"), b.get("user", "?")))
    return {"ok": True, "rev": obj["rev"]}


def api_schedule_move(b):
    v = b["version"]
    def fn(obj):
        item = None
        for s in obj["slots"]:
            for i in list(s["items"]):
                if i["feature_index"] == b["feature_index"]:
                    item = i
                    s["items"].remove(i)
        if item is None:
            raise RuntimeError("해당 안건을 찾을 수 없음")
        if b.get("cancel"):
            obj.setdefault("unassigned", []).append(item["feature_index"])
            return obj
        tgt = next((s for s in obj["slots"] if s["date"] == b["date"] and s["time"] == b["time"]), None)
        if tgt is None:
            tgt = {"date": b["date"], "time": b["time"], "items": [], "capacity_min": 60}
            obj["slots"].append(tgt)
            obj["slots"].sort(key=lambda s: (s["date"], s["time"]))
        tgt["items"].append(item)
        used = sum(i["est_min"] for i in tgt["items"])
        obj["warning"] = ("슬롯 %s %s 용량 초과 (%d분/60분)" % (b["date"], b["time"], used)) if used > tgt["capacity_min"] else ""
        return obj
    obj = store.update(store.dpath(v, "schedule.json"), fn, base_rev=b.get("base_rev"))
    return {"ok": True, "rev": obj["rev"], "warning": obj.get("warning", "")}


def api_schedule_slot(b):
    """슬롯 수동 추가/삭제. 회의 시간이 매번 달라 슬롯은 사람이 직접 관리한다.
    삭제 시 담긴 안건은 미배정 목록으로 이동."""
    v, op = b["version"], b["op"]
    def fn(obj):
        obj.setdefault("slots", [])
        if op == "add":
            if not b.get("date") or not b.get("time"):
                raise RuntimeError("날짜와 시각을 입력하세요")
            if any(s["date"] == b["date"] and s["time"] == b["time"] for s in obj["slots"]):
                raise RuntimeError("같은 날짜·시각의 슬롯이 이미 있습니다")
            obj["slots"].append({"date": b["date"], "time": b["time"], "items": [],
                                 "capacity_min": int(b.get("capacity_min") or 60)})
            obj["slots"].sort(key=lambda s: (s["date"], s["time"]))
        elif op == "del":
            s = next((x for x in obj["slots"] if x["date"] == b["date"] and x["time"] == b["time"]), None)
            if s is None:
                raise RuntimeError("슬롯을 찾을 수 없음")
            obj.setdefault("unassigned", []).extend(i["feature_index"] for i in s["items"])
            obj["slots"].remove(s)
        return obj
    obj = store.update(store.dpath(v, "schedule.json"), fn,
                       {"rev": 0, "milestones": [], "slots": []}, base_rev=b.get("base_rev"))
    return {"ok": True, "rev": obj["rev"]}


def api_schedule_est(b):
    """소요시간 수동 수정."""
    v = b["version"]
    def fn(obj):
        for s in obj["slots"]:
            for i in s["items"]:
                if i["feature_index"] == b["feature_index"]:
                    i["est_min"] = int(b["est_min"])
                    i["est_by"] = b.get("user", "?")
        return obj
    obj = store.update(store.dpath(v, "schedule.json"), fn, base_rev=b.get("base_rev"))
    return {"ok": True, "rev": obj["rev"]}


def api_meetings_confirm(b):
    """추출 결과 확정 → 결정 반영 + 액션 등록 + 예상 vs 실제 비교."""
    v, mid, user = b["version"], b["meeting_id"], b.get("user", "?")
    decisions, actions = b.get("decisions", []), b.get("actions", [])
    def fn_m(obj):
        m = next((x for x in obj["items"] if x["id"] == mid), None)
        if m is None:
            raise RuntimeError("회의를 찾을 수 없음")
        m["extracted"] = {"decisions": decisions, "actions": actions}
        m["confirmed"] = True
        m["confirmed_by"] = user
        m["confirmed_at"] = store.now()
        return obj
    store.update(store.dpath(v, "meetings.json"), fn_m, base_rev=b.get("base_rev"))
    dmap = {d["feature_index"]: d for d in decisions}
    def fn_f(obj):
        for f in obj["features"]:
            d = dmap.get(f["feature_index"])
            if d:
                f["decision"] = "rejected" if d["decision"] == "no_go" else d["decision"]
                f["decision_conditions"] = d.get("conditions", [])
                f["status"] = "decided"
        return obj
    store.update(store.dpath(v, "features.json"), fn_f)
    def fn_a(obj):
        base = max([int(a["id"][1:]) for a in obj["items"] if a["id"][1:].isdigit()] or [0])
        for k, a in enumerate(actions, 1):
            obj["items"].append({"id": "A%d" % (base + k), "feature_index": a.get("feature_index", ""),
                                 "action": a["action"], "owner_dept": a.get("owner_dept", ""),
                                 "due": a.get("due", ""), "plm_status": "pending", "plm_id": "",
                                 "report_needed": None, "followup_scheduled": False})
        return obj
    store.update(store.dpath(v, "actions.json"), fn_a, {"rev": 0, "items": []})
    # 예상 vs 실제
    sched = store.load(store.dpath(v, "schedule.json"), {"slots": []})
    comps = []
    for s in sched["slots"]:
        for i in s["items"]:
            d = dmap.get(i["feature_index"])
            pred = i.get("predicted")
            if d and pred:
                comps.append({"feature_index": i["feature_index"],
                              "predicted": pred["predicted_decision"], "actual": d["decision"],
                              "match": pred["predicted_decision"] == d["decision"]})
    if comps:
        acc = round(sum(c["match"] for c in comps) / len(comps) * 100)
        def fn_p(obj):
            obj.setdefault("runs", []).insert(0, {"at": store.now(), "meeting_id": mid,
                                                  "n": len(comps), "accuracy": acc, "detail": comps})
            return obj
        store.update(store.dpath(v, "prediction_stats.json"), fn_p, {"rev": 0, "runs": []})
        store.notify("persona", "SW담당 예상 적중률 %d%% (%d건, %s)" % (acc, len(comps), mid))
    store.notify("meeting", "%s 확정 — 결정 %d건, 액션 %d건" % (mid, len(decisions), len(actions)))
    rej = sum(1 for d in decisions if d["decision"] == "no_go")
    if rej:
        store.notify("meeting", "거절 %d건 — 통계 모수에서 제외됨" % rej)
    return {"ok": True}


def api_plm_advance(b):
    """PLM mock: pending→sent→in_progress→done 진행. [회사 작업] 실제 PLM API 어댑터로 교체."""
    v = b["version"]
    order = ["pending", "sent", "in_progress", "done"]
    def fn(obj):
        for a in obj["items"]:
            if b.get("action_id") and a["id"] != b["action_id"]:
                continue
            i = order.index(a["plm_status"]) if a["plm_status"] in order else 0
            if i < 3:
                a["plm_status"] = order[i + 1]
                if a["plm_status"] == "sent" and not a["plm_id"]:
                    a["plm_id"] = "PLM-%s-%s" % (store.now()[:10].replace("-", ""), a["id"])
        return obj
    store.update(store.dpath(v, "actions.json"), fn, base_rev=b.get("base_rev"))
    return {"ok": True}


def api_followup(b):
    """후속 보고 → 최빠른 가용 슬롯 우선 삽입."""
    v, aid = b["version"], b["action_id"]
    acts = store.load(store.dpath(v, "actions.json"), {"items": []})
    a = next((x for x in acts["items"] if x["id"] == aid), None)
    if a is None:
        raise RuntimeError("액션을 찾을 수 없음")
    def fn(obj):
        item = {"feature_index": a["feature_index"], "est_min": 5, "followup": True, "predicted": None}
        for s in obj["slots"]:
            used = sum(i["est_min"] for i in s["items"])
            if used + 5 <= s["capacity_min"]:
                s["items"].insert(0, item)
                return obj
        obj.setdefault("unassigned", []).append(a["feature_index"])
        obj["warning"] = "가용 슬롯 없음 — 수동 조정 필요"
        return obj
    obj = store.update(store.dpath(v, "schedule.json"), fn)
    def fn_a(o):
        for x in o["items"]:
            if x["id"] == aid:
                x["followup_scheduled"] = True
        return o
    store.update(store.dpath(v, "actions.json"), fn_a)
    store.notify("followup", "후속 보고 배정: %s (%s)" % (a["feature_index"], aid))
    return {"ok": True, "warning": obj.get("warning", "")}


def api_query(b):
    out = jobs.run_query(b["question"], store.versions(), b.get("mode", "basic"))
    return out


def api_notif_read(b):
    user = b.get("user", "?")
    def fn(obj):
        for n in obj["items"]:
            if user not in n["read_by"]:
                n["read_by"].append(user)
        return obj
    store.update(store.dpath("notifications.json"), fn)
    return {"ok": True}


# ---------- 설정 ----------

CONFIG_FILES = {"engines", "excel_schema", "users"}


def api_config_save(name, b):
    """설정 저장 — 관리자 전용. data에 파일 전체 객체를 받는다."""
    if name not in CONFIG_FILES:
        raise RuntimeError("허용되지 않은 설정")
    if b.get("role") != "admin":
        raise RuntimeError("설정 변경은 관리자만 가능합니다")
    data = b.get("data")
    if not isinstance(data, dict):
        raise RuntimeError("잘못된 설정 형식")
    store.save(store.path("config", name + ".json"), data)
    store.notify("job", "설정 변경됨: config/%s.json (%s)" % (name, b.get("user", "?")))
    return {"ok": True}


# ---------- 인입 업로드 (취합 엑셀 + 발표 PPT) ----------

def api_ingest_upload(b):
    """이번 버전의 취합 엑셀·발표 PPT 업로드. 새 버전명을 주면 버전이 생성된다."""
    if b.get("role") != "admin":
        raise RuntimeError("인입은 관리자만 가능합니다")
    version = (b.get("version") or "").strip()
    if not re.match(r"^[\w.\-]+$", version):
        raise RuntimeError("버전명이 올바르지 않습니다 (예: 8.5)")
    existing = store.load(store.dpath(version, "features.json"), None)
    if existing and existing.get("readonly"):
        raise RuntimeError("지난 버전은 읽기 전용입니다")
    fname = os.path.basename(b.get("filename", ""))
    updir = store.dpath(version, "uploads")
    os.makedirs(updir, exist_ok=True)
    fp = os.path.join(updir, fname)
    with open(fp, "wb") as f:
        f.write(base64.b64decode(b["b64"]))
    if fname.lower().endswith(".xlsx"):
        return ingest.ingest_excel(version, fp)
    if fname.lower().endswith(".pptx"):
        out = ingest.ingest_ppt(version, fp)
        jobs.enqueue("ppt_render", version, b.get("user", "?"), {"file": fp})
        out["note"] = "슬라이드 이미지 렌더링 작업이 큐에 등록됨 (PowerPoint 필요 — 없으면 자동 건너뜀)"
        return out
    raise RuntimeError("지원 형식: .xlsx(취합본), .pptx(발표자료)")


# ---------- PPT 매핑 확인 (사람 확정 절차) ----------

def _png_name(fname, slide_num):
    base = re.sub(r"[^\w\-가-힣]", "_", os.path.splitext(fname)[0])
    return "%s_slide%d.png" % (base, slide_num)


def api_mapping_assign(b):
    """슬라이드 1장을 이동: 미매핑→Feature, Feature→다른 Feature, Feature→미매핑(제거).
    렌더링된 PNG가 있으면 함께 이동한다."""
    v = b["version"]
    file, num = b["file"], int(b["slide"])
    to = b.get("to_feature")            # None/"" = 미매핑으로
    def fn(obj):
        entry = None
        for u in list(obj.get("unmapped_slides", [])):
            if u["file"] == file and u["slide"] == num:
                entry = u
                obj["unmapped_slides"].remove(u)
        for f in obj["features"]:
            for s in list(f.get("slides_text", [])):
                if s["file"] == file and s["slide"] == num:
                    entry = s
                    f["slides_text"].remove(s)
                    png = _png_name(file, num)
                    if png in f["slides"]:
                        f["slides"].remove(png)
        if entry is None:
            raise RuntimeError("해당 슬라이드를 찾을 수 없음")
        if to:
            tf = next((f for f in obj["features"] if f["feature_index"] == to), None)
            if tf is None:
                raise RuntimeError("대상 Feature를 찾을 수 없음: " + to)
            tf.setdefault("slides_text", []).append({"slide": num, "text": entry.get("text", ""), "file": file})
            png = _png_name(file, num)
            if os.path.exists(store.dpath(v, "slides", png)) and png not in tf["slides"]:
                tf["slides"].append(png)
        else:
            obj.setdefault("unmapped_slides", []).append({"slide": num, "file": file, "text": entry.get("text", "")})
        obj["mapping"] = {"confirmed": False, "confirmed_by": "", "at": ""}
        return obj
    store.update(store.dpath(v, "features.json"), fn)
    return {"ok": True}


def api_mapping_confirm(b):
    v = b["version"]
    def fn(obj):
        obj["mapping"] = {"confirmed": True, "confirmed_by": b.get("user", "?"), "at": store.now()}
        return obj
    obj = store.update(store.dpath(v, "features.json"), fn)
    left = len(obj.get("unmapped_slides", []))
    store.notify("job", "PPT 매핑 확정 (%s, %s)%s" % (v, b.get("user", "?"),
                 " — 미매핑 %d장은 검사에서 제외됨" % left if left else ""))
    return {"ok": True, "unmapped_left": left}


# ---------- 골든셋 업로드 ----------

REC_ALIAS = {"go": "go", "진행": "go", "conditional_go": "conditional_go", "조건부": "conditional_go",
             "defer": "defer", "보류": "defer", "no_go": "no_go", "거절": "no_go", "반대": "no_go"}


def _golden_cols():
    """정답 열 이름 — 스키마 설정에서 바꿀 수 있고, 없으면 기본값."""
    sc = store.load(store.path("config", "excel_schema.json"), {})
    g = sc.get("golden_columns", {})
    return g.get("grade", "정답등급"), g.get("rec", "정답권고"), g.get("note", "메모")


def api_golden_upload(b):
    """골든셋 엑셀/PPT 업로드 (base64). 관리자 전용.
    엑셀: '정답등급'·'정답권고'(·'메모') 열 + 나머지는 취합 엑셀과 같은 데이터 열.
    PPT: 슬라이드 텍스트에서 인덱스(F### 등)를 찾아 해당 골든 항목에 슬라이드 텍스트 연결."""
    if b.get("role") != "admin":
        raise RuntimeError("골든셋 등록은 관리자만 가능합니다")
    fname = os.path.basename(b.get("filename", ""))
    if not fname:
        raise RuntimeError("파일명이 없습니다")
    updir = store.path("golden", "uploads")
    os.makedirs(updir, exist_ok=True)
    fp = os.path.join(updir, fname)
    with open(fp, "wb") as f:
        f.write(base64.b64decode(b["b64"]))
    gs_fp = store.path("golden", "golden_set.json")
    schema = store.load(store.path("config", "excel_schema.json"), {})
    idx_col = (schema.get("fields") or {}).get("feature_index", "인덱스")

    if fname.lower().endswith(".xlsx"):
        rows = office.xlsx_rows(fp, int(schema.get("header_row", 1)))
        if not rows:
            raise RuntimeError("엑셀에서 데이터 행을 찾지 못했습니다")
        TRUTH_GRADE_COL, TRUTH_REC_COL, NOTE_COL = _golden_cols()
        added = updated = skipped = 0
        problems = []
        def fn(obj):
            nonlocal added, updated, skipped
            items = obj.setdefault("items", [])
            for r in rows:
                idx = r.get(idx_col) or r.get("인덱스") or ""
                grade = (r.get(TRUTH_GRADE_COL) or "").upper()
                rec = REC_ALIAS.get((r.get(TRUTH_REC_COL) or "").strip().lower()) or \
                      REC_ALIAS.get((r.get(TRUTH_REC_COL) or "").strip())
                if not idx or grade not in ("P0", "P1", "P2") or not rec:
                    skipped += 1
                    problems.append(idx or "(인덱스 없음)")
                    continue
                row_data = {k: v for k, v in r.items() if k not in (TRUTH_GRADE_COL, TRUTH_REC_COL, NOTE_COL)}
                item = {"feature_index": idx, "row": row_data,
                        "truth": {"final_grade": grade, "final_recommendation": rec},
                        "note": r.get(NOTE_COL, ""), "source": fname}
                old = next((x for x in items if x["feature_index"] == idx), None)
                if old:
                    old.update(item)
                    updated += 1
                else:
                    items.append(item)
                    added += 1
            return obj
        store.update(gs_fp, fn, {"items": [], "runs": []})
        store.notify("persona", "골든셋 엑셀 업로드: %s — 추가 %d, 갱신 %d, 제외 %d" % (fname, added, updated, skipped))
        return {"ok": True, "kind": "xlsx", "added": added, "updated": updated, "skipped": skipped,
                "problems": problems[:10]}

    if fname.lower().endswith(".pptx"):
        slides = office.pptx_slide_texts(fp)
        gs = store.load(gs_fp, {"items": []})
        idxs = [it["feature_index"] for it in gs["items"]]
        mapped = {}
        unmapped = 0
        for num, text in slides:
            hit = next((i for i in idxs if i and i in text), None)
            m = re.search(r"[A-Z]\d{3}", text)
            key = hit or (m.group(0) if m and m.group(0) in idxs else None)
            if key:
                mapped.setdefault(key, []).append({"slide": num, "text": text[:1500]})
            else:
                unmapped += 1
        def fn(obj):
            for it in obj["items"]:
                if it["feature_index"] in mapped:
                    it["slides_text"] = mapped[it["feature_index"]]
                    it["slides_file"] = fname
            return obj
        store.update(gs_fp, fn, {"items": [], "runs": []})
        store.notify("persona", "골든셋 PPT 업로드: %s — 매핑 %d건, 미매핑 슬라이드 %d" % (fname, len(mapped), unmapped))
        return {"ok": True, "kind": "pptx", "mapped": len(mapped), "unmapped_slides": unmapped}

    raise RuntimeError("지원 형식: .xlsx, .pptx")


def api_golden_delete(b):
    if b.get("role") != "admin":
        raise RuntimeError("관리자만 삭제할 수 있습니다")
    def fn(obj):
        obj["items"] = [x for x in obj.get("items", []) if x["feature_index"] != b["feature_index"]]
        return obj
    store.update(store.path("golden", "golden_set.json"), fn, {"items": [], "runs": []})
    return {"ok": True}


# ---------- 페르소나 편집 ----------

SCHEMA_KEYS = ["feature_index", "results"]


def api_prompts_list():
    pdir = store.path("prompts")
    out = []
    for fn in sorted(os.listdir(pdir)):
        if fn.endswith(".md") and fn != "README.md":
            hdir = store.path("prompts", "_history", fn[:-3])
            n_hist = len(os.listdir(hdir)) if os.path.isdir(hdir) else 0
            out.append({"name": fn[:-3], "history": n_hist})
    return {"prompts": out}


def api_prompt_get(name):
    fp = store.path("prompts", name + ".md")
    hdir = store.path("prompts", "_history", name)
    hist = []
    if os.path.isdir(hdir):
        for h in sorted(os.listdir(hdir), reverse=True)[:10]:
            hist.append(h)
    return {"name": name, "text": open(fp, encoding="utf-8").read(), "history": hist}


def api_prompt_save(name, b):
    fp = store.path("prompts", name + ".md")
    if not os.path.exists(fp):
        raise RuntimeError("존재하지 않는 프롬프트")
    old = open(fp, encoding="utf-8").read()
    hdir = store.path("prompts", "_history", name)
    os.makedirs(hdir, exist_ok=True)
    ts = store.now().replace(":", "").replace("-", "")
    shutil.copy(fp, os.path.join(hdir, "%s_%s.md" % (ts, b.get("user", "?"))))
    text = b["text"]
    warn = ""
    if name.startswith("persona-") and ("feature_index" in old) and ("feature_index" not in text):
        warn = "경고: 출력 스키마의 'feature_index' 필드가 사라졌습니다 — 파서와 어긋날 수 있습니다"
    with open(fp, "w", encoding="utf-8") as f:
        f.write(text)
    store.notify("persona", "페르소나 '%s' 수정됨 (%s)%s" % (name, b.get("user", "?"),
                 " — 재실행 대상: 해당 페르소나+종합" if name.startswith("persona-") else ""))
    return {"ok": True, "warning": warn}


def serve(port=8765):
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("One UI Agent server → http://localhost:%d  (Ctrl+C 종료)" % port)
    httpd.serve_forever()
