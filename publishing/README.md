# 스마트메모 퍼블리싱 패키지 v1.0

승인된 다크 네이비·하늘색 디자인의 HTML/CSS/JavaScript 소스입니다. 이미지 재해석 없이 Django에 연결하기 위한 패키지입니다.

## 먼저 보기 — npm 설치 불필요

압축을 풀고 `preview.html`을 Brave에서 엽니다. 사진용 `assets/` 폴더를 함께 유지하세요. 파일 URL에서 저장소가 제한되는 브라우저라면 아래처럼 로컬 서버로 열면 됩니다. 브라우저별·포트별로 데모 저장소는 별개입니다.

```bash
cd ~/ganzskang/theMemo/publishing
python -m http.server 8088 --bind 127.0.0.1
```

Brave에서 `http://127.0.0.1:8088/preview.html`을 엽니다. `?outline=1`을 덧붙이면 시안처럼 오른쪽 목차를 연 상태로 시작합니다. `?view=blog`는 블로그 목록, `?view=read`는 읽기 화면입니다. 다른 서버가 이 포트를 쓰면 빈 포트를 사용하세요.

**데모의 ‘이 기기에 저장됨’은 서버 저장이 아닙니다.** 현재 브라우저의 IndexedDB에 저장합니다. 로그인·서버 백업·기기 간 동기화·실제 접근 권한은 Django 연결 후 제공됩니다. JSON 내보내기로 현재 기록을 파일로 보관할 수 있습니다. 브라우저 사이트 데이터를 지우면 데모 기록이 사라집니다.

## 구현된 퍼블리싱 기능

- 작성 / 블로그형 목록 / 읽기, 데스크톱·모바일 반응형 레이아웃.
- 실제 Tiptap 3.33.0 + ProseMirror 문서 편집. execCommand 사용 없음.
- 제목·문단, 굵게·기울임·밑줄·취소선, 글꼴·크기·글자색·강조색, 정렬.
- 글머리·번호·체크 목록, 인용문, 코드 블록, 구분선, 표 삽입·행/열 추가 및 삭제.
- / 삽입 메뉴, 텍스트 선택 서식 메뉴, 현재 블록 위/아래 이동.
- 사진 선택·드롭·붙여넣기, 삽입 시 대체 텍스트·캡션, 표지 추가·제거.
- 태그, 메모장 추가·변경, 기록 날짜, 즐겨찾기, 휴지통·복원, JSON 내보내기.
- 자동/수동 브라우저 저장, 재열기, revision 충돌 감지. 실패 시 이동을 중단하고 내용 유지.
- 본문 검색, 메모장·태그·월 필터, 피드/간단 목록, 이전·다음 기록.
- 목차, 집중 모드, 모바일 drawer·삽입 sheet, 화면 설정, 단축키.
- Django 연결용 adapter와 API 계약. 운영 모드에서 데모로 자동 fallback하지 않음.

## 아직 별도 구현·검증할 부분

- Django 프로젝트, 로그인, DB, 실제 서버 저장과 이미지 업로드 엔드포인트.
- 브라우저 초안과 서버 기록의 영속적인 복구·오프라인 동기화. Django 모드 저장 실패 시 현재 화면 내용 유지와 JSON 내보내기만 제공함.
- 첨부 파일, 고급 이미지 크기·정렬·기존 캡션 수정, 실제 drag handle, PDF/Markdown 내보내기, AI·협업.
- Android 실기기 한글 IME와 가상 키보드 위치. visualViewport 대응 코드는 있으나 실기기 검증 완료를 의미하지 않음.
- 로그인 화면은 포함하지 않음. Django LoginView 템플릿은 기존 토큰으로 최소 추가.

## 소스 수정 / 재빌드

Node.js 24.22.1 이상인 24 LTS 계열을 권장합니다. 의존성 버전은 `package-lock.json`에 고정했습니다.

```bash
npm ci
npm run dev
```

기본 개발 주소는 Vite가 출력합니다. 배포 산출물과 미리보기 재생성:

```bash
npm run check
npm run build
npm test
```

`npm test`는 Node/JSDOM/fake-indexeddb 기반 기능 검증입니다. 실제 Chromium 렌더링·모바일 실기기 검증을 대신하지 않습니다. `dist/`와 `preview.html`은 빌드 결과이므로 직접 편집하지 마세요. 실행 시 외부 CDN·폰트·이미지 서버에 의존하지 않습니다. 본문 서체는 로컬 시스템 폰트를 사용합니다.

## 파일 안내

| 파일 | 역할 |
|---|---|
| `preview.html` + `assets/` | 설치 없이 확인할 빌드된 미리보기 |
| `index.html` | Django Template로 옮길 실제 화면 마크업 |
| `src/styles.css` | Tailwind v4 로컬 빌드 + 디자인 토큰·반응형·본문 스타일 |
| `src/main.js` | 화면 전환·도구·검색·저장 상태·이벤트 |
| `src/editor.js` | 편집기 스키마·이미지·본문 유틸리티 |
| `src/adapters.js` | 브라우저 저장 / Django API 경계 |
| `src/sample-data.js` | 데모 전용 샘플. 운영 DB에 자동 입력 금지 |
| `public/assets/` | 원본 빌드 자산. river.png는 생성형 예시 이미지 |
| `dist/` | 검증된 JS·CSS 번들 및 Vite manifest |
| `docs/HANDOFF.md` | Codex CLI가 먼저 읽을 짧은 인수인계 |
| `docs/DJANGO_INTEGRATION.md` | API·저장·권한·자산 연결 계약 |
| `docs/CODEX_PROMPT_01.md` | 지금 실행할 Django 로컬 MVP 통합 프롬프트 |
| `docs/CODEX_PROMPT_02.md` | 첫 단계 완료 후 실사용 보완 프롬프트 |
| `docs/VERIFICATION.md` | 검증 범위와 한계 |
| `THIRD_PARTY_NOTICES.txt` | 번들 라이브러리의 라이선스 안내 |

모든 파일은 `smartmemo-publishing/` 아래에 묶였습니다. `node_modules`는 포함하지 않았습니다. 기존 `theMemo` 루트를 덮지 말고 **프로젝트 내부 `publishing/`**에 배치합니다.

## Codex CLI 작업 시작

이전 REA 분석 세션 대신 **새 세션**을 사용합니다. 기존 조사 파일을 지우지 마세요. 프로젝트 루트에서 아래 경로의 첫 프롬프트를 전달합니다.

```text
publishing/docs/CODEX_PROMPT_01.md를 읽고 이번 작업 범위만 구현해 줘.
```

한 번에 프롬프트 두 개를 모두 실행하지 않습니다. 첫 작업의 구현·필수 검증·인수인계를 마친 뒤 다음 기능으로 이동합니다. 세션을 바꾸어도 계정의 5시간 한도가 초기화되지는 않습니다.
