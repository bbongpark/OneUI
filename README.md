# One UI Agent

One UI Feature의 **버전 탑재 여부를 결정하는 부사장급 리뷰 회의**를 준비·운영·후속 관리하는
AI 페르소나 파이프라인 + 팀 대시보드.

```
엑셀 취합 → AI 페르소나 리뷰(P0/P1/P2 + 진행 권고) → PL 검사(발표 준비·일정 리스크)
   → 회의 일정 배정 → SW담당 예상 판정 → 회의록 → 결정·액션 → PLM → 후속 보고 ↺
   → 인사이트 리포트 · 보고 PPT 생성
```

## 빠른 시작

```bash
python scripts/gen_demo_data.py   # 데모 데이터 생성 (실데이터 투입 후에는 실행 금지)
python server.py                  # → http://localhost:8765
```

- **설치 불필요**: Python 표준 라이브러리만 사용 (pip/npm 패키지 0개)
- 필요 환경: Python 3.8+, (선택) MS Office — PPT→PNG 렌더링용
- 첫 로그인: `관리자`
- `data/`는 저장소에 없다 (운영 데이터·기밀). 데모로 동작을 확인한 뒤 실데이터를 인입한다.

## 문서

| 문서 | 내용 |
|---|---|
| **[HANDOVER.md](HANDOVER.md)** | **회사 환경에서 이어받아 할 일** — 여기부터 읽으세요 |
| [DESIGN.md](DESIGN.md) | 설계 기준점 — 파이프라인, 화면, 데이터 구조, 결정 배경 |
| [CLAUDE.md](CLAUDE.md) | AI 어시스턴트용 안내 — 아키텍처, 불변 규칙, 작업 레시피 |
| [prompts/README.md](prompts/README.md) | 페르소나 구성과 호출 규약 |

## 구조

```
server.py            진입점 (표준 라이브러리 HTTP 서버)
server/              store(JSON+락) · jobs(작업 큐) · engines(AI 어댑터)
                     api(HTTP) · ingest(엑셀/PPT 인입) · office(xlsx/pptx 파서)
web/                 바닐라 JS 대시보드 (빌드 없음, 화면 1개 = 파일 1개)
prompts/             AI 페르소나 = 마크다운 파일 (대시보드에서 편집)
config/              엔진 · 엑셀 스키마 매핑 · 사용자
scripts/             PowerShell COM (엑셀/PPT/백업)
data/<버전>/         모든 상태 (JSON 파일)
golden/              페르소나 품질 측정용 정답 세트
```

## 화면 (10)

현황판(KPI·파이프라인·인입·작업 큐) · 리뷰 보드(판정·오버라이드·슬라이드 뷰어·PPT 매핑 확인) ·
회의(슬롯 관리·배정·회의록→결정 추출) · 추적(액션·PLM·후속 보고) · 인사이트 · 질의(전 버전 검색) ·
페르소나(프롬프트 편집·골든셋) · 알림 센터 · 로그·산출물 · 설정

## 설계 원칙

1. **모든 상태는 JSON 파일** — 디버깅은 파일 열람, 백업은 폴더 zip
2. **AI 제안 → 사람 확정** — 모든 AI 판단에 수정·이력·`needs_human` 경로
3. **의존성 제로** — pip/npm 없이 회사 PC에서 바로 실행
4. **엑셀 스키마는 설정으로** — 열 이름을 코드에 하드코딩하지 않음
5. **엔진 교체 가능** — Gemini(기본) / Claude(예비) 어댑터
