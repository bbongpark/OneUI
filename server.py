# -*- coding: utf-8 -*-
"""One UI Agent — 진입점. 표준 라이브러리만 사용.
실행: python server.py [포트]   (기본 8765)
"""
import sys
from server import jobs, api

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    jobs.start()
    api.serve(port)
