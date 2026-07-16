# -*- coding: utf-8 -*-
"""데모 데이터 생성기 — 뼈대 검증용 가짜 데이터를 data/ 아래 생성한다.
실행: python scripts/gen_demo_data.py   (프로젝트 루트에서)
회사에서는 이 스크립트 대신 실제 엑셀 인입(scripts/excel_to_json.ps1)을 쓴다.
"""
import json, os, random, hashlib, datetime  # noqa: F401

random.seed(85)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, "data", *p)
NOW = "2026-07-15"

FUNCS = ["홈/런처", "카메라", "설정", "잠금화면", "커넥티비티", "메시지/통화", "갤러리", "시스템UI"]   # 기능명
AI_CATS = ["온디바이스 AI", "생성형 AI", "AI 추천", "AI 없음", "클라우드 AI"]                        # AI카테고리
NAMES = [
    "잠금화면 위젯 커스터마이징 확장", "카메라 야간모드 자동 전환", "홈 화면 폴더 색상 지정",
    "알림 요약 AI 카드", "빠른 설정 레이아웃 개편", "통화 녹음 자동 텍스트 변환",
    "갤러리 중복 사진 정리 제안", "배터리 보호 충전 스케줄", "폴더블 커버 화면 위젯 스택",
    "메시지 스팸 필터 강화", "DeX 멀티윈도우 스냅 레이아웃", "테마 아이콘 일괄 적용",
    "화면 녹화 부분 캡처", "블루투스 다중 연결 전환 UI", "키보드 클립보드 이력 확장",
    "글자 크기 앱별 설정", "무음 모드 예외 연락처", "사진 촬영 위치 프라이버시 블러",
    "위젯 추천 개인화", "다크모드 일출/일몰 전환", "긴급 SOS 위젯", "앱 대기 모드 최적화",
    "잠금화면 알림 프라이버시 필터", "카메라 워터마크 커스텀", "설정 검색 자연어 지원",
    "사이드 버튼 동작 확장", "화면 분할 제스처 개선", "볼륨 패널 미디어 라우팅",
    "AOD 음악 컨트롤", "링크 공유 미리보기 개선", "Wi-Fi 자동 전환 민감도 설정",
    "연락처 중복 병합 제안", "스크린샷 편집 툴바 개편", "앱잠금 생체인증 통합",
    "알람 점진적 볼륨", "배경화면 AI 생성", "모드/루틴 위치 트리거 확장",
    "키보드 손글씨 입력", "휴대폰 찾기 오프라인 강화", "미디어 출력 기기 위젯",
    "접근성 확대 제스처 개선", "통화 배경 소음 제거", "홈 화면 그리드 확장",
    "간편 모드 개선", "엣지 패널 클립보드", "카메라 프로 모드 히스토그램",
    "갤러리 스토리 자동 생성", "알림 채널 일괄 관리", "화면 주사율 앱별 설정",
    "보안 폴더 빠른 전환", "글로벌 검색 통합", "NFC 태그 루틴 실행",
    "자녀 보호 사용 리포트", "위치 공유 임시 링크", "이어버즈 착용 감지 개선",
    "PDF 스캔 문서 보정", "듀얼 메신저 알림 뱃지 구분", "라이브 캡션 다국어",
    "빅스비 루틴 추천 카드", "충전 완료 알림 사운드 설정"
]
DEV_OWNERS = ["jh.kim@partner-dev.com", "yr.lee@partner-dev.com", "sw.park@partner-dev.com",
              "mj.choi@partner-dev.com", "dh.jung@partner-dev.com", "hs.kang@partner-dev.com"]  # 개발담당자 메일
STATUS_POOL = ["기획완료", "설계중", "구현중", "구현완료", "검증중", "검증완료"]
MODELS = ["전 모델", "플래그십", "폴더블", "플래그십+폴더블"]
AI_GRADES = ["P0", "P1", "P2"]                  # AI가 매기는 등급 (SHARE·DOC는 하드룰)
G_ORDER = {g: i for i, g in enumerate(AI_GRADES)}
RECS = ["support", "hold", "reject"]     # 회의 결정 = 지원 | 보류 | 미지원
CHANGE_TYPES = ["기능 추가", "동작 변경", "UI 개선", "문구 수정", "오타 수정", "성능 개선"]
PERSONAS = ["experience_planning", "ux", "dev", "cxi"]
P_LABEL = {"experience_planning": "경험기획", "ux": "UX", "dev": "개발", "cxi": "CXI"}

RATIONALES = {
    "experience_planning": ["상위 사용 시나리오와 직결되며 이번 버전 방향과 정합", "차별화 요소이나 시나리오 엣지 케이스 보완 필요", "사용자 가치는 있으나 시급성이 낮음", "전략 방향과 무관한 고립 개선으로 판단"],
    "ux": ["기존 패턴 내 개선으로 학습 비용 없음", "새 인터랙션 도입 — 발견 가능성 검증 필요", "기존 습관을 깨는 변경으로 반발 리스크 존재", "접근성 회귀 우려 항목 포함"],
    "dev": ["구현 범위 국소적, 회귀 리스크 낮음", "공용 모듈 변경 포함 — 회귀 테스트 범위 큼", "타 부서 모듈 의존성으로 일정 리스크", "상시 동작 요소로 배터리 영향 검증 필요"],
    "cxi": ["상위 VOC와 직결, 정량 근거 충분", "커뮤니티 요청 다수이나 수치 미기재", "고객 체감 미미한 내부 개선", "기본값 변경으로 기존 사용자 불만 유발 가능"],
}
KEYQ = ["경쟁사 대비 차별점이 유지되는가?", "폴더블 커버 화면 시나리오는 검증되었는가?", "VOC 수치의 집계 기간과 모수는?", "일정 내 검증 완료가 가능한가?", "기본값 변경 시 기존 사용자 마이그레이션 정책은?", ""]

def h(s):
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:12]

def make_version(ver, n, reviewed_ratio, decided_ratio, prev_rejected=None):
    feats, reviews, plc = [], {}, {}
    for i in range(1, n + 1):
        idx = f"F{i:03d}"
        # 엑셀에는 Feature 이름 열이 없다 — 아래 NAMES는 변경점 문장을 만드는 재료로만 쓰고,
        # 화면에 보이는 제목(name)은 AI가 변경점을 요약해 채운다(job_title).
        topic = NAMES[(i - 1) % len(NAMES)] + ("" if i <= len(NAMES) else f" {i//len(NAMES)+1}차")
        func = FUNCS[i % len(FUNCS)]
        cat = AI_CATS[i % len(AI_CATS)]
        dev_st = random.choice(STATUS_POOL)
        # CL 열: 실제 운영에서 개발 완료 판정 기준 — 커밋된 건만 CL 번호가 채워진다
        cl = str(random.randint(4100000, 4999999)) if dev_st in ("구현완료", "검증중", "검증완료") else \
             random.choice(["", "", "", "-", "TBD"])
        # 일정: UX 일정이 있어야 개발 일정이 나온다. 개발 일정이 DVR(8/28)을 넘으면 리스크
        ux_d = None if random.random() < 0.12 else datetime.date(2026, 7, random.randint(20, 31))
        dev_d = None if (ux_d is None or random.random() < 0.15) else \
            ux_d + datetime.timedelta(days=random.randint(14, 55))
        # 변경점: 대부분 템플릿을 지키지만 일부는 부실 → 하드룰이 '자료 보완 필요'로 판정
        ctype = random.choice(CHANGE_TYPES)
        bad = random.random() < 0.1
        change = random.choice(["개선함", "수정", "-", "TBD"]) if bad else \
            f"[변경 전] 기존 {topic.split()[0]} 동작 유지 → [변경 후] {topic} 적용. 사유: 사용성 개선 및 VOC 대응. 영향: {func} 모듈."
        row = {
            "인덱스": idx, "기능명": func, "AI카테고리": cat, "변경유형": ctype,
            "CL": cl,
            "UX일정": ux_d.isoformat() if ux_d else "",
            "개발일정": dev_d.isoformat() if dev_d else "",
            "적용모델": random.choice(MODELS),
            "변경점": change,
            "VOC건수": random.choice(["", str(random.randint(20, 4200))]),
        }
        # 개발 담당자 메일 — 개발 일정이 잡힌 항목에만. 셀에 1~2명이 공백으로 들어간다(.com 아이디).
        row["개발담당자"] = " ".join(random.sample(DEV_OWNERS, random.randint(1, 2))) if dev_d else ""
        # AI 상세 열 — AI 관련 Feature에만 값이 있다(비AI는 빈칸). config/excel_schema.json의 ai_detail로 상세에 표시.
        is_ai = cat != "AI 없음"
        row.update({
            "신규/고도화": random.choice(["신규", "고도화"]) if is_ai else "",
            "권역": random.choice(["글로벌", "국내", "북미", "유럽", "글로벌(중국 제외)"]) if is_ai else "",
            "지원언어": random.choice(["한국어", "한/영", "한/영/중/일", "전 언어(16종)"]) if is_ai else "",
            "유료화": random.choice(["무료", "구독형", "부분 유료"]) if is_ai else "",
            "요소기술": random.choice(["온디바이스 LLM", "클라우드 LLM", "STT", "이미지 생성", "추천 엔진"]) if is_ai else "",
            "KPI": random.choice(["MAU +5%", "VOC 30% 감소", "체류시간 +8%", "미설정"]) if is_ai else "",
            "일반인베타 오픈여부": random.choice(["오픈", "미오픈", "검토중"]) if is_ai else "",
        })
        st_reviewed = i <= int(n * reviewed_ratio)
        st_decided = i <= int(n * decided_ratio)
        status = "meeting_wait" if st_reviewed else ("reviewing" if i <= int(n * reviewed_ratio) + 6 else "ingested")
        decision = None
        if st_decided:
            decision = random.choices(["support", "hold", "reject"], weights=[62, 26, 12])[0]
            status = "decided"
        reregistered = None
        if prev_rejected and i % 17 == 0 and prev_rejected:
            reregistered = prev_rejected.pop(0) if prev_rejected else None
        # name = AI가 변경점을 요약한 제목 (job_title). 데모에선 미리 채워둔다.
        title = "" if bad else f"{topic} 적용"
        feats.append({
            "feature_index": idx, "name": title or (change[:30] + "…" if len(change) > 30 else change),
            "function_name": func, "ai_category": cat,
            "row": row, "row_hash": h(json.dumps(row, ensure_ascii=False)),
            "status": status, "decision": decision,
            "decision_conditions": ["정량 근거 보완 후 재확인"] if decision == "hold" else [],
            "slides": [f"{idx}_{k}.svg" for k in range(1, 4)] if i <= 12 else ([f"{idx}_1.svg"] if i % 3 else []),
            "reregistered_from": reregistered, "input_changed": (i % 23 == 0 and st_reviewed),
        })
        # 변경점이 부실하면 규칙이 앞단에서 '자료 보완 필요'로 확정 — AI를 부르지 않는다
        if bad and (st_reviewed or status == "reviewing"):
            why = "'변경점'이 자리채움 값('%s')" % change if change in ("-", "TBD") else \
                  "'변경점'이 %d자로 너무 짧음 (최소 20자)" % len(change)
            reviews[idx] = {"personas": {}, "input_hash": h(idx + "in"),
                            "hard_rule": {"grade": "DOC", "reason": why},
                            "synthesis": {"feature_index": idx, "final_grade": "DOC", "divergent": False,
                                          "divergent_summary": "", "rationale": "규칙: " + why,
                                          "meeting_questions": [], "status": "ok", "reason": "", "by_rule": True}}
        elif st_reviewed or status == "reviewing":
            done = PERSONAS if st_reviewed else PERSONAS[: random.randint(1, 3)]
            # 부문 페르소나는 의견만 (등급은 종합이 매긴다)
            pr = {}
            for p in done:
                pr[p] = {"opinion": random.choice(RATIONALES[p]),
                         "key_question": random.choice(KEYQ), "status": "ok"}
            entry = {"personas": pr, "prompt_hash": "a1b2c3", "input_hash": h(idx + "in")}
            if st_reviewed:
                fg = random.choices(AI_GRADES, weights=[22, 45, 33])[0]
                div = random.random() < 0.22
                needs_h = div and random.random() < 0.15
                syn = {
                    "final_grade": fg,
                    "divergent": div,
                    "divergent_summary": "부문 간 인식 차 — 기획은 전략 과제, 개발은 일정 우려" if div else "",
                    "rationale": "부문 간 인식 차가 커 회의에서 정렬 필요" if div else "부문 의견 일치, 쟁점 제한적",
                    "meeting_questions": [q for q in random.sample(KEYQ[:5], 2)],
                    "status": "needs_human" if needs_h else "ok",
                    "reason": "부문 의견이 정면 충돌하며 근거가 모두 타당" if needs_h else "",
                }
                # P2 중 단순 공유는 규칙이 고른다 (변경유형이 문구/오타 수정)
                if fg == "P2" and row["변경유형"] in ("문구 수정", "오타 수정"):
                    syn["ai_grade"] = "P2"
                    syn["final_grade"] = "SHARE"
                    syn["rationale"] = "규칙: 변경 유형이 문구·오타 수정 (AI 판정 P2 → 단순 공유)"
                    entry["share_rule"] = {"reason": "(예시) 변경 유형이 문구·오타 수정이면 공유"}
                entry["synthesis"] = syn
                if random.random() < 0.08:
                    entry["override"] = {"field": "final_grade", "from": fg,
                                         "to": random.choice([g for g in ("P0", "P1", "P2") if g != fg]),
                                         "by": "관리자", "reason": "전략 과제로 상향", "at": NOW + "T10:20:00"}
            reviews[idx] = entry
        if st_reviewed and not bad:
            issues_doc = [] if random.random() < 0.62 else [random.choice(["'VOC건수' 미기입", "'변경점' 템플릿 미준수 — 영향 범위 없음", "'적용모델' 미기입"])]
            issues_slide = [] if random.random() < 0.7 else [{"slide": random.randint(1, 3), "issue": random.choice(["우측 상단 표 2칸 빈칸", "VOC 언급에 정량 수치 없음", "변경 전/후 비교 슬라이드 없음"])}]
            plc[idx] = {"ready": not issues_doc and not issues_slide, "doc_issues": issues_doc,
                        "slide_issues": issues_slide, "status": "ok"}
    return feats, reviews, plc

def main():
    os.makedirs(D("8.5", "slides"), exist_ok=True)
    os.makedirs(D("8.5", "references"), exist_ok=True)
    os.makedirs(D("8.5", "output"), exist_ok=True)
    os.makedirs(D("8.0"), exist_ok=True)

    # ---- 8.0 (지난 버전, 읽기 전용) ----
    f80, r80, p80 = make_version("8.0", 40, 1.0, 1.0)
    rejected80 = [f["feature_index"] for f in f80 if f["decision"] == "reject"]
    json.dump({"version": "8.0", "readonly": True, "features": f80}, open(D("8.0", "features.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"rev": 1, "items": r80}, open(D("8.0", "reviews.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"rev": 1, "items": p80}, open(D("8.0", "pl_checks.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ---- 8.5 (현재 버전) ----
    prev_rej = [f"8.0/{x}" for x in rejected80]
    f85, r85, p85 = make_version("8.5", 60, 0.75, 0.25, prev_rej)
    json.dump({"version": "8.5", "readonly": False, "features": f85}, open(D("8.5", "features.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"rev": 3, "items": r85}, open(D("8.5", "reviews.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"rev": 2, "items": p85}, open(D("8.5", "pl_checks.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 일정: 마일스톤 + 회의 슬롯
    slots = []
    day_feats = [f for f in f85 if f["status"] in ("meeting_wait", "decided")]
    random.shuffle(day_feats)
    # 회의는 하루 한 번 — 회의일 3일을 지정해 배정한다
    days = ["2026-07-20", "2026-07-22", "2026-07-24"]
    di = 0
    for d in days:
        take, mins = [], 0
        while day_feats and mins < 55:
            ft = day_feats.pop()
            est = random.choice([3, 5, 5, 8, 12])
            take.append({"feature_index": ft["feature_index"], "est_min": est,
                         "followup": di % 9 == 8, "predicted": None})
            mins += est
            di += 1
        slots.append({"date": d, "time": "14:00", "items": take, "capacity_min": 60})
    unassigned = [f["feature_index"] for f in day_feats]   # 슬롯에 안 들어간 나머지
    json.dump({"rev": 2, "dvr": "2026-08-28", "milestones": [
        {"name": "UX 시안 확정", "date": "2026-07-31"},
        {"name": "검증 시작", "date": "2026-09-04"},
        {"name": "최종 빌드", "date": "2026-09-25"},
    ], "slots": slots, "unassigned": unassigned},
        open(D("8.5", "schedule.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 회의록/결정
    json.dump({"rev": 1, "items": [
        {"id": "M1", "date": "2026-07-20", "time": "10:00", "title": "리뷰 회의 1차",
         "minutes_raw": "F001 잠금화면 위젯 — 지원 확정. 커버화면 시나리오 8월 중 보고.\nF002 카메라 야간모드 — 보류 (배터리 영향 수치 보완 후 재논의).\nF003 홈 폴더 색상 — 미지원, 이번 버전 제외.",
         "extracted": {"decisions": [
             {"feature_index": "F001", "decision": "support", "conditions": []},
             {"feature_index": "F002", "decision": "hold", "conditions": ["배터리 영향 수치 보완"]},
             {"feature_index": "F003", "decision": "reject", "conditions": []}],
             "actions": [{"feature_index": "F001", "action": "커버화면 시나리오 검증 결과 보고", "owner_dept": "홈/런처", "due": "2026-08-14"},
                         {"feature_index": "F002", "action": "배터리 소모 측정 리포트 제출", "owner_dept": "카메라", "due": "2026-08-07"}]},
         "confirmed": True, "confirmed_by": "관리자", "confirmed_at": "2026-07-20T16:00:00"}
    ]}, open(D("8.5", "meetings.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 액션 아이템
    json.dump({"rev": 1, "items": [
        {"id": "A1", "feature_index": "F001", "action": "커버화면 시나리오 검증 결과 보고", "owner_dept": "홈/런처",
         "due": "2026-08-14", "plm_status": "sent", "plm_id": "PLM-20260720-001", "report_needed": None, "followup_scheduled": False},
        {"id": "A2", "feature_index": "F002", "action": "배터리 소모 측정 리포트 제출", "owner_dept": "카메라",
         "due": "2026-08-07", "plm_status": "done", "plm_id": "PLM-20260720-002", "report_needed": True, "followup_scheduled": True},
        {"id": "A3", "feature_index": "F007", "action": "중복 사진 판정 기준 UX 검토", "owner_dept": "갤러리",
         "due": "2026-08-21", "plm_status": "in_progress", "plm_id": "PLM-20260721-003", "report_needed": None, "followup_scheduled": False}
    ]}, open(D("8.5", "actions.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 알림
    json.dump({"rev": 1, "items": [
        {"id": "N5", "type": "job", "text": "PL 검사 배치 완료 (45건 판정, 미준비 17건)", "at": NOW + "T14:02:00", "read_by": []},
        {"id": "N4", "type": "needs_human", "text": "종합 판정 보류 3건 — 부문 권고 충돌, 사람 확인 필요", "at": NOW + "T13:40:00", "read_by": []},
        {"id": "N3", "type": "risk", "text": "일정 리스크 high 6건 감지 (개발 완료 마일스톤 기준)", "at": NOW + "T13:38:00", "read_by": []},
        {"id": "N2", "type": "meeting", "text": "리뷰 회의 1차 결과 확정 — 결정 3건, 액션 2건 등록", "at": "2026-07-20T16:01:00", "read_by": ["관리자"]},
        {"id": "N1", "type": "persona", "text": "페르소나 'persona-cxi' 수정됨 (관리자) — 재실행 대상: CXI+종합", "at": "2026-07-14T09:12:00", "read_by": ["관리자"]}
    ]}, open(D("notifications.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 사용량
    json.dump({"rev": 1, "month": "2026-07", "total_usd": 41.7, "by_engine": {"mock": 0.0, "gemini": 0.0, "claude": 41.7},
               "calls": [{"at": NOW + "T13:20:00", "engine": "claude", "job": "review_batch", "in_tokens": 182000, "out_tokens": 21000, "usd": 0.86}]},
              open(D("usage.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 인사이트
    open(D("8.5", "insight.md"), "w", encoding="utf-8").write(
        "# One UI 8.5 인사이트 리포트 (데모)\n\n생성: 2026-07-15 · 참고자료 1건 기반\n\n"
        "## 주요 지향점\n1. **잠금화면·홈 개인화 심화** — 관련 Feature 14건 (전체의 23%) [출처: 취합 데이터]\n"
        "2. **AI 보조 기능의 생활화** — 요약·정리·제안형 기능 11건 [출처: 취합 데이터]\n"
        "3. **폴더블 커버 경험 보강** — 8건 [출처: 취합 데이터]\n\n"
        "## 트렌드 정합성\n- 개인화 심화는 2026 모바일 UX 흐름과 정합 [출처: references/2026_UX_동향.md]\n"
        "- 커버 화면 위젯 스택은 경쟁사 미지원 영역 — 차별화 기회 [출처: references/2026_UX_동향.md]\n\n"
        "## 리스크\n- AI 기능군 11건 중 7건이 VOC 정량 근거 미기재 — 회의 전 보완 권고\n")
    open(D("8.5", "references", "2026_UX_동향.md"), "w", encoding="utf-8").write(
        "# 2026 모바일 UX 동향 조사 (데모 문서)\n\n- 잠금화면·홈 개인화가 주요 경쟁 축으로 부상\n- 온디바이스 AI 요약/제안 기능의 기본 탑재화\n- 폴더블 커버 화면 활용도가 구매 결정 요인으로 상승\n")

    # 슬라이드 SVG 플레이스홀더
    for f in f85:
        for s in f["slides"]:
            k = s.split("_")[1].split(".")[0]
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">'
                   f'<rect width="960" height="540" fill="#f4f6fa"/><rect x="24" y="24" width="912" height="64" rx="8" fill="#0f3460"/>'
                   f'<text x="44" y="64" font-family="Malgun Gothic" font-size="26" fill="#fff">[{f["feature_index"]}] {f["name"]}</text>'
                   f'<rect x="660" y="104" width="276" height="120" rx="8" fill="#fff" stroke="#c5d0e0"/>'
                   f'<text x="676" y="132" font-size="15" fill="#33415c" font-family="Malgun Gothic">기능: {f["function_name"]} · AI: {f["ai_category"]}</text>'
                   f'<text x="676" y="158" font-size="15" fill="#33415c" font-family="Malgun Gothic">적용: {f["row"]["적용모델"]} · VOC: {f["row"]["VOC건수"] or "미기재"}</text>'
                   f'<rect x="24" y="104" width="612" height="400" rx="8" fill="#fff" stroke="#c5d0e0"/>'
                   f'<text x="44" y="140" font-size="18" fill="#1a2233" font-family="Malgun Gothic">슬라이드 {k} — 변경점 요약 (데모 플레이스홀더)</text>'
                   f'<text x="44" y="172" font-size="14" fill="#4a5568" font-family="Malgun Gothic">{f["row"]["변경점"][:60]}...</text></svg>')
            open(D("8.5", "slides", s), "w", encoding="utf-8").write(svg)

    print("demo data generated:", len(f85), "features (8.5),", len(f80), "features (8.0)")

if __name__ == "__main__":
    main()
