# 검증 기록

작성일: 2026-11-10. Node.js 24.22.1 환경.

## 통과한 검사

- `npm run check`: main.js, adapters.js, editor.js 문법 검사.
- `npm run build`: Vite production bundle, Tailwind v4 CSS, manifest 생성 및 독립 실행 preview 생성.
- `npm test`: Node test runner + JSDOM + fake-indexeddb 기반 7개 테스트 그룹.

| 테스트 그룹 | 주요 확인 |
|---|---|
| JSON·이미지 프로토콜 | plain text 추출, javascript·SVG data URL·protocol-relative 이미지 거부 |
| 저장 동시성 | 동일 revision 두 저장의 후발 요청 거부, 원본 보존 |
| 앱 작성→저장→조회 | 신규 메모, / 메뉴, 실제 ProseMirror 굵게·체크리스트·undo/redo, 태그 중복 제거, 저장 후 새 DOM 세션에서 재열기, 검색·읽기·휴지통/복원 |
| 표·사진·메모장 | 표 생성, 사진의 alt·caption 표현, HTML처럼 생긴 메모장명 이스케이프, 검색 빈 결과 |
| UI 충돌 | 외부 revision 갱신 후 현재 초안 유지, 이동 차단, JSON 보관 버튼 표시 |
| 모드 설정 | 잘못된 Django 설정이 데모 모드로 조용히 전환되지 않음 |
| 미리보기 산출물 | standalone 안의 JS가 실제 빌드 결과와 일치하고 외부 script 의존이 없음 |

App tests는 실제 Tiptap/ProseMirror bundle을 DOM 환경에서 실행했다. 표·본문 노드를 수동으로 흉내 내는 테스트가 아니다. 단, JSDOM에는 레이아웃과 dialog 표시 구현이 없어서 dialog open/close와 Range geometry 등 일부 브라우저 API는 test shim을 썼다. 사진 테스트는 FileReader와 캡션·스키마 경로를 검증하며 실제 이미지 디코딩이나 서버 이미지 보안을 검증하는 테스트가 아니다.

## 아직 확인하지 못한 항목

- 실제 브라우저 렌더링 스크린샷·시각 QA: 현재 실행 환경의 로컬 브라우저/미리보기 접근 제한으로 미실행.
- Android Brave/Chrome의 실제 한글 조합·키보드·사진 선택·붙여넣기, iOS Safari 동작.
- 화면 읽기 프로그램과 키보드 탐색 전체 시나리오.
- Django 서버의 인증·권한·revision 동시성·이미지 검증·백업. 서버 코드는 이 패키지에 포함하지 않음.
- 대규모 문서·대용량 사진·수천 개 메모에 대한 성능·용량 시험.

따라서 이 패키지는 검증된 퍼블리싱 기능 기반이며, 운영 서비스 전체의 검증 완료를 의미하지 않는다.

## 사용자 로컬의 짧은 확인 순서

1. README의 로컬 서버로 preview.html을 열고, 데스크톱 1440px와 모바일 390px/320px에서 가로 넘침·도구 겹침 확인.
2. 새 메모 → 한글 제목·본문 → 굵게/체크 목록/사진 → 저장 → 새로고침 → 블로그 검색 → 읽기.
3. 2개 탭에서 같은 기록을 수정하고 두 번째 저장이 충돌을 알리며 현재 초안을 유지하는지 확인.
4. 실제 Android에서 연속 받침 입력·선택 서식·키보드 표시·뒤로가기·사진 선택 확인.

빌드의 번들 크기 안내와 HTMX 의존 코드의 eval 관련 경고는 build 실패가 아니며, 프로젝트의 CSP·코드 분할 정책을 정할 때 필요한 범위에서 검토한다. 이번 전달을 위해 UI 프레임워크나 라이브러리를 교체하지 않았다.
