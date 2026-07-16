# -*- coding: utf-8 -*-
"""JSON 파일 저장소 — 서버가 유일한 쓰기 주체. 쓰기 락 + 낙관적 잠금(rev)."""
import json, os, threading, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
_lock = threading.RLock()


def now():
    return datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def path(*p):
    return os.path.join(ROOT, *p)


def dpath(*p):
    return os.path.join(DATA, *p)


def load(fp, default=None):
    with _lock:
        if not os.path.exists(fp):
            return default
        with open(fp, encoding="utf-8") as f:
            return json.load(f)


def save(fp, obj):
    """원자적 쓰기: tmp에 쓰고 교체."""
    with _lock:
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        tmp = fp + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        os.replace(tmp, fp)


def update(fp, fn, default=None, base_rev=None):
    """읽기→수정→쓰기를 락 안에서. base_rev가 주어지면 낙관적 잠금 검사.
    fn(obj) -> obj (수정 후 반환). rev 필드가 있으면 +1."""
    with _lock:
        obj = load(fp, default if default is not None else {})
        if base_rev is not None and obj.get("rev") != base_rev:
            raise ConflictError(f"rev mismatch: server={obj.get('rev')} client={base_rev}")
        obj = fn(obj)
        if isinstance(obj, dict) and "rev" in obj:
            obj["rev"] = (obj.get("rev") or 0) + 1
        save(fp, obj)
        return obj


class ConflictError(Exception):
    pass


def versions():
    """data/ 아래 버전 폴더 목록 (features.json이 있는 것만)."""
    out = []
    if os.path.isdir(DATA):
        for name in sorted(os.listdir(DATA), reverse=True):
            if os.path.isfile(dpath(name, "features.json")):
                out.append(name)
    return out


def notify(ntype, text):
    """알림 발행 — 알림 센터 피드에 추가. (회사 확장: 여기서 메신저 어댑터 호출)"""
    fp = dpath("notifications.json")
    def fn(obj):
        items = obj.setdefault("items", [])
        nid = "N%d" % (max([int(i["id"][1:]) for i in items if i["id"][1:].isdigit()] or [0]) + 1)
        items.insert(0, {"id": nid, "type": ntype, "text": text, "at": now(), "read_by": []})
        del items[200:]
        return obj
    update(fp, fn, {"rev": 0, "items": []})


def record_usage(engine, job, in_tok, out_tok, usd):
    fp = dpath("usage.json")
    def fn(obj):
        obj["total_usd"] = round(obj.get("total_usd", 0) + usd, 4)
        be = obj.setdefault("by_engine", {})
        be[engine] = round(be.get(engine, 0) + usd, 4)
        obj.setdefault("calls", []).insert(0, {"at": now(), "engine": engine, "job": job,
                                               "in_tokens": in_tok, "out_tokens": out_tok, "usd": usd})
        del obj["calls"][500:]
        return obj
    update(fp, fn, {"rev": 0, "month": now()[:7], "total_usd": 0, "by_engine": {}, "calls": []})
