# -*- coding: utf-8 -*-
"""드롭인 어댑터 로더 — 코어(server/)를 수정하지 않고 '파일 추가'만으로 실제 연결한다.

- 어댑터 파일이 **없으면** 코어가 mock/내장 동작으로 폴백한다.
- 어댑터 파일이 **있으면** 코어가 자동으로 그 어댑터에 위임한다.

회사에서 채울 어댑터:
  adapters/plm.py            — PLM API 연결 (예제: adapters/plm_example.py)
  adapters/engine_<name>.py  — CLI/AI 엔진 연결 (예제: adapters/engine_example.py)
                               config/engines.json에서 그 엔진 type을 "custom"으로.

규약·작성법은 adapters/README.md 참조. 표준 라이브러리만 쓸 것(의존성 제로 원칙).
"""
import importlib, os, sys

_HERE = os.path.dirname(__file__)


def _try(modname):
    """adapters/<modname>.py가 있으면 import해 모듈을 반환, 없거나 실패하면 None."""
    if not os.path.exists(os.path.join(_HERE, modname + ".py")):
        return None
    try:
        return importlib.import_module("adapters." + modname)
    except Exception as e:  # 어댑터가 깨져도 코어는 살아 있어야 한다 → None으로 폴백
        print("[adapters] '%s' 로드 실패 (mock으로 폴백): %s" % (modname, e), file=sys.stderr)
        return None


def load_plm():
    """adapters/plm.py 모듈 (advance 함수 보유) 또는 None."""
    return _try("plm")


def load_engine(name):
    """adapters/engine_<name>.py, 없으면 adapters/engine.py, 없으면 None (run 함수 보유)."""
    return _try("engine_" + name) or _try("engine")


def status():
    """현황판/자가진단이 어떤 어댑터가 연결됐는지 보여줄 때 쓴다."""
    engines = [f[len("engine_"):-3] for f in os.listdir(_HERE)
               if f.startswith("engine_") and f.endswith(".py") and not f.endswith("_example.py")]
    if os.path.exists(os.path.join(_HERE, "engine.py")):
        engines.append("(공용 engine.py)")
    return {"plm": load_plm() is not None, "engines": engines}
