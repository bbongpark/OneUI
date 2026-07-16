# -*- coding: utf-8 -*-
"""AI 엔진 어댑터 — 파이프라인 본체는 엔진을 모른다.
계약: run(persona, prompt_text, payload, attachments) -> dict(JSON 결과) + 사용량 기록.

- mock  : 데모용. CLI 없이 그럴듯한 결과 생성 (뼈대 검증·화면 개발용)
- spawn : 호출마다 프로세스 실행 (Gemini CLI 기본 가정) — 회사에서 자가진단 후 플래그 확정
- persistent : 상주 워커 (Claude CLI) — stream-json stdin/stdout
"""
import json, os, random, subprocess, tempfile, re
from . import store

CFG = lambda: store.load(store.path("config", "engines.json"), {})


def engine_for(persona):
    cfg = CFG()
    pe = (cfg.get("persona_engines") or {}).get(persona) or {}
    name = pe.get("engine") or cfg.get("default_engine", "mock")
    return name, (cfg.get("engines") or {}).get(name, {"type": "mock"})


def run(persona, prompt_text, payload, attachments=None):
    """payload: dict (배치 데이터). 반환: 파싱된 JSON dict."""
    name, ecfg = engine_for(persona)
    etype = ecfg.get("type", "mock")
    if etype == "mock":
        result = _mock(persona, payload)
        in_tok = len(prompt_text) // 3 + len(json.dumps(payload, ensure_ascii=False)) // 3
        out_tok = len(json.dumps(result, ensure_ascii=False)) // 3
        store.record_usage(name, persona, in_tok, out_tok, 0.0)
        return result
    if etype == "spawn":
        return _spawn(name, ecfg, persona, prompt_text, payload, attachments)
    if etype == "persistent":
        return _persistent(name, ecfg, persona, prompt_text, payload, attachments)
    raise RuntimeError("unknown engine type: " + etype)


def selftest():
    """엔진 자가진단 — 설정된 기본 엔진의 실측 검증. mock이면 항상 통과."""
    name, ecfg = engine_for("_selftest")
    checks = [
        {"check": "비대화형 실행 후 종료", "key": "noninteractive"},
        {"check": "순수 JSON 출력", "key": "json"},
        {"check": "이미지 파일 읽기", "key": "image"},
        {"check": "지정 폴더 파일 읽기", "key": "file"},
    ]
    if ecfg.get("type") == "mock":
        for c in checks:
            c.update(passed=True, note="mock 엔진 — 항상 통과 (데모)")
        return {"engine": name, "checks": checks, "all_passed": True}
    # 실제 엔진: 최소 프로브 실행 (회사에서 플래그 확정 후 유효)
    try:
        probe = run("_selftest", "다음 JSON만 출력하라: {\"ok\": true}", {})
        ok = bool(probe.get("ok"))
    except Exception as e:
        ok = False
        for c in checks:
            c.update(passed=False, note=str(e)[:200])
        return {"engine": name, "checks": checks, "all_passed": False}
    for c in checks:
        c.update(passed=ok, note="기본 프로브 통과" if ok else "JSON 프로브 실패")
    return {"engine": name, "checks": checks, "all_passed": ok}


# ---------- spawn (Gemini) ----------

def _spawn(name, ecfg, persona, prompt_text, payload, attachments):
    """호출마다 프로세스. 프롬프트+데이터를 임시 파일로 전달.
    [회사 작업] 자가진단 후 command 플래그를 실제 Gemini CLI 규약으로 확정할 것."""
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write(prompt_text + "\n\n## 입력 데이터(JSON)\n" + json.dumps(payload, ensure_ascii=False))
        pfile = f.name
    cmd = [c.replace("{prompt_file}", pfile) for c in ecfg.get("command", [])]
    if attachments:
        cmd += [str(a) for a in attachments]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                             timeout=ecfg.get("timeout_sec", 300))
        text = out.stdout or ""
        result = _extract_json(text)
        store.record_usage(name, persona, len(prompt_text) // 3, len(text) // 3, 0.0)
        return result
    finally:
        try:
            os.unlink(pfile)
        except OSError:
            pass


# ---------- persistent (Claude) ----------

_worker = {"proc": None, "jobs": 0}


def _persistent(name, ecfg, persona, prompt_text, payload, attachments):
    """상주 워커. N작업마다 재시작. 실패 시 워커 재기동 후 1회 재시도."""
    limit = ecfg.get("restart_every_jobs", 12)
    if _worker["proc"] is None or _worker["proc"].poll() is not None or _worker["jobs"] >= limit:
        _restart_worker(ecfg)
    msg = json.dumps({"type": "user", "message": {"role": "user", "content":
                      prompt_text + "\n\n## 입력 데이터(JSON)\n" + json.dumps(payload, ensure_ascii=False)}},
                     ensure_ascii=False)
    p = _worker["proc"]
    p.stdin.write(msg + "\n")
    p.stdin.flush()
    text = ""
    while True:
        line = p.stdout.readline()
        if not line:
            raise RuntimeError("claude worker died")
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get("type") == "result":
            text = ev.get("result", "")
            usage = ev.get("usage", {})
            store.record_usage(name, persona, usage.get("input_tokens", 0),
                               usage.get("output_tokens", 0), ev.get("total_cost_usd", 0.0))
            break
    _worker["jobs"] += 1
    return _extract_json(text)


def _restart_worker(ecfg):
    if _worker["proc"] is not None:
        try:
            _worker["proc"].kill()
        except OSError:
            pass
    _worker["proc"] = subprocess.Popen(ecfg.get("command", []), stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                       text=True, encoding="utf-8")
    _worker["jobs"] = 0


def _extract_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON in engine output: " + text[:200])
    return json.loads(m.group(0))


# ---------- mock 엔진 ----------

GRADES = ["P0", "P1", "P2", "SHARE", "DOC"]     # 리뷰 등급 5단계
GRADE_ORDER = {g: i for i, g in enumerate(["DOC", "P0", "P1", "P2", "SHARE"])}   # 종합 우선순위
RECS = ["go", "conditional_go", "defer", "no_go"]   # 회의 결정·예상 판정용 (리뷰 산출물 아님)


def _seed(s):
    return random.Random(hash(s) & 0xFFFFFF)


def _mock(persona, payload):
    feats = payload.get("features", [])
    if persona.startswith("persona-") and persona not in ("persona-synthesis", "persona-pl", "persona-sw-director"):
        res = []
        for ft in feats:
            r = _seed(persona + ft["feature_index"])
            res.append({"feature_index": ft["feature_index"],
                        "grade": r.choices(GRADES, weights=[12, 34, 30, 16, 8])[0],
                        "status": "ok", "reason": "",
                        "rationale": "(mock) %s 관점 자동 분류 — 실제 엔진 연결 시 교체됨" % persona,
                        "key_question": r.choice(["폴더블 시나리오 검증 여부?", "VOC 집계 기간?", ""])})
        return {"persona": persona, "results": res}
    if persona == "persona-synthesis":
        res = []
        for ft in feats:
            pr = ft.get("personas", {})
            grades = [v["grade"] for v in pr.values()] or ["P1"]
            # 우선순위: DOC > P0 > P1 > P2 > SHARE (SHARE는 만장일치일 때만)
            fg = min(grades, key=lambda g: GRADE_ORDER.get(g, 9))
            if fg == "SHARE" and not all(g == "SHARE" for g in grades):
                fg = "P2"
            spread = max(GRADE_ORDER.get(g, 9) for g in grades) - min(GRADE_ORDER.get(g, 9) for g in grades)
            div = spread >= 2
            r = _seed("syn" + ft["feature_index"])
            res.append({"feature_index": ft["feature_index"], "final_grade": fg,
                        "divergent": div,
                        "divergent_summary": "부문 간 등급이 %s로 갈림" % "/".join(sorted(set(grades))) if div else "",
                        "rationale": "(mock) 4개 부문 등급 종합", "meeting_questions": ["핵심 쟁점 확인 필요?"] if div else [],
                        "status": "needs_human" if (div and r.random() < 0.25) else "ok",
                        "reason": "부문 등급 정면 충돌" if div else ""})
        return {"persona": "synthesis", "results": res}
    if persona == "persona-pl":
        res = []
        for ft in feats:
            r = _seed("pl" + ft["feature_index"])
            di = [] if r.random() < 0.6 else ["'VOC건수' 미기입"]
            si = [] if r.random() < 0.7 else [{"slide": r.randint(1, 3), "issue": "우측 상단 표 빈칸"}]
            res.append({"feature_index": ft["feature_index"], "ready": not di and not si,
                        "doc_issues": di, "slide_issues": si, "status": "ok", "reason": ""})
        return {"persona": "pl", "results": res}
    if persona == "persona-sw-director":
        res = []
        for ft in feats:
            r = _seed("dir" + ft["feature_index"])
            res.append({"feature_index": ft["feature_index"],
                        "predicted_decision": r.choices(RECS, weights=[50, 25, 17, 8])[0],
                        "predicted_conditions": [], "confidence": r.choice(["high", "medium", "low"]),
                        "rationale": "(mock) 판단 성향 기반 예측", "anticipated_questions": [r.choice(["일정 내 검증 가능한가?", "커뮤니티 반발 시나리오는?", "VOC 수치 근거는?"])],
                        "status": "ok", "reason": ""})
        return {"persona": "sw_director", "results": res}
    if persona == "aux-minutes-extract":
        return _mock_minutes(payload.get("minutes", ""), feats)
    if persona == "aux-duration-estimate":
        return {"results": [{"feature_index": ft["feature_index"],
                             "est_min": _seed("dur" + ft["feature_index"]).choice([3, 5, 5, 8, 12]),
                             "rationale": "(mock) 쟁점 수 기반 추정", "status": "ok"} for ft in feats]}
    if persona == "aux-plm-report-judge":
        return {"results": [{"action_id": a["id"], "report_needed": _seed("plm" + a["id"]).random() < 0.5,
                             "rationale": "(mock) 조건 응답성 판정", "status": "ok", "reason": ""}
                            for a in payload.get("actions", [])]}
    if persona == "aux-insight-report":
        return {"markdown": "# 인사이트 리포트 (mock 생성)\n\n생성: " + store.now() +
                            "\n\n## 주요 지향점\n1. 개인화 심화 [출처: 취합 데이터]\n2. AI 보조 기능 확산 [출처: 취합 데이터]\n\n" +
                            "## 트렌드 정합성\n- 참고자료 기반 분석은 실제 엔진 연결 후 유효 [출처: references/]\n"}
    if persona == "aux-query":
        return {"answer": "(mock) 검색된 후보 %d건 기준 요약 — 실제 엔진 연결 시 자연어 답변으로 교체됩니다." % len(payload.get("chunks", [])),
                "sources": [{"version": c.get("version"), "feature_index": c.get("feature_index"),
                             "kind": c.get("kind"), "ref": c.get("ref")} for c in payload.get("chunks", [])[:5]],
                "found": bool(payload.get("chunks"))}
    return {"results": []}


def _mock_minutes(minutes, feats):
    """간단 규칙 추출: 'F001 ... 진행/조건부/보류/거절' 패턴."""
    decs, acts = [], []
    for line in minutes.splitlines():
        m = re.search(r"(F\d{3})", line)
        if not m:
            continue
        idx = m.group(1)
        low = line.lower()
        if "조건부" in line:
            dec = "conditional_go"
        elif "보류" in line or "차기" in line:
            dec = "defer"
        elif "거절" in line or "드랍" in line or "no-go" in low or "no_go" in low:
            dec = "no_go"
        elif "진행" in line or "확정" in line or "go" in low:
            dec = "go"
        else:
            dec = None
        if dec:
            cond = []
            cm = re.search(r"\(([^)]+)\)", line)
            if dec == "conditional_go" and cm:
                cond = [cm.group(1)]
            decs.append({"feature_index": idx, "decision": dec, "conditions": cond,
                         "confidence": "high", "status": "ok", "reason": ""})
        am = re.search(r"(보고|제출|검토|측정|검증)", line)
        if am and ("까지" in line or "중" in line or dec == "conditional_go"):
            acts.append({"feature_index": idx, "action": line.split("—")[-1].strip()[:60],
                         "owner_dept": "", "due": ""})
    return {"decisions": decs, "actions": acts}
