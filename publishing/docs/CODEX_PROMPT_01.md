# 작업 1 — 제공된 퍼블리싱을 Django 로컬 MVP에 연결

새 Codex CLI 세션에서 이 파일을 작업 지시로 실행한다.

## 목표

`/home/cskang/ganzskang/theMemo`에서 승인된 스마트메모 UI를 유지한 채, 로그인 후 본인 기록을 서버에 저장하고 다시 편집·블로그 조회할 수 있는 Django 로컬 MVP를 완성한다. 이번 작업의 완료 목표는 **기존 프런트엔드와 Django 서버의 연결** 한 건이다.

## 먼저 읽을 자료

1. 적용되는 AGENTS.md. 사용자 홈·현재 디렉터리·상위 경로의 실제 적용 파일만 확인하고 다른 프로젝트를 재귀 검색하지 않는다.
2. `publishing/docs/HANDOFF.md`.
3. `publishing/docs/DJANGO_INTEGRATION.md`.
4. 연결 구현에 필요한 원본: `publishing/src/adapters.js`, `publishing/src/editor.js`, `publishing/index.html`.

현재 프로젝트 파일·Git 상태를 확인한다. 기존 파일·연구 문서·사용자 변경은 보존한다. Git이 없으면 프로젝트 루트에 init해도 되며 초기화로 파일을 지우지 않는다.

## 구현

- uv + pyproject.toml + 프로젝트 .venv, Python 3.13. 현재 dj5나 글로벌 패키지를 변경하지 않는다.
- Django 5.2 LTS의 현재 패치 버전을 사용하고 uv.lock에 고정한다. Django project package는 **theMemo**. 초기 DB는 SQLite.
- 기존 Django가 있으면 재생성하지 말고 현재 구조에 연결한다.
- notes 앱 중심으로 Note, Notebook, MemoImage와 owner·revision·JSON 유효성 처리를 구현한다. tags는 우선 JSONField 문자열 목록으로 충분하다. 불필요한 추상 모델·범용 repository·REST 프레임워크는 추가하지 않는다.
- 표준 Django 사용자·인증을 사용한다. 공개 회원가입은 만들지 않고 운영자 계정 생성 명령만 안내한다. LoginView/로그아웃 POST와 최소 로그인 템플릿을 기존 색상 토큰으로 구성한다. 임의 비밀번호나 SECRET_KEY를 커밋하지 않는다.
- API·권한·revision·비공개 이미지·데이터 형식은 연결 계약대로 구현한다. 이미지도 현재 UI의 로컬 MVP 연결 범위에 포함한다.
- 모든 리소스는 로그인 owner로 제한하며 서버가 강제한다. 다른 사용자의 UUID로 생성·수정·이미지 참조를 우회할 수 없어야 한다.
- 원본 HTML을 Django Template로 옮기고 정적 경로, CSRF, json_script bootstrap, manifest만 연결한다. `mode=django`이며 운영 샘플 자동 생성 금지.
- 앱 CSS·JS·레이아웃·Tiptap 스키마는 재작성하지 않는다. 이미 제공된 API adapter를 활용한다. 연결에 필요한 수정만 한다.
- `publishing/dist/.vite/manifest.json`과 기존 빌드 산출물을 먼저 사용한다. JS/CSS 소스를 수정하지 않았다면 npm 재설치·전체 재빌드는 필요 없다. 프런트엔드 수정 시에만 npm ci 및 build를 실행한다.
- HTMX는 활성 편집 영역을 교체하지 않게 한다. 이 작업에서 별도 SPA·협업·AI·오프라인 동기화·배포 구성을 추가하지 않는다.

## 사용량·실행 전략

- REA·네이버 분석·편집기 비교·디자인 재설계는 하지 않는다.
- node_modules, dist JS/CSS, preview.html, lockfile 전체, 사진·시안 이미지는 모델 문맥에 읽지 않는다.
- 상세 계획 보고서나 반복적인 승인 요청 없이, 범위 내 일반 구현 선택은 결정하고 실행한다.
- 인자·설정 오류는 원인을 확인해 같은 작업에서 수정한다. 원인 확인 없는 동일 호출 반복은 하지 않는다.
- 서브에이전트는 사용하지 않는다. 기본 추론 설정을 유지하고 임의로 최고 강도로 올리지 않는다.
- 검증은 아래 완료 기준에 직접 필요한 것만 실행한다. 통과한 검증은 코드 변경·새 위험 없이 반복하지 않는다.
- 배포, DNS, nginx, systemd 설정과 외부 공개는 이번 범위가 아니다.

## 완료 기준

1. Django check·migration이 정상이고 로그인 후 앱이 열린다.
2. 본인 메모 생성·편집·재조회와 JSON 서식 보존, 메모장·태그·즐겨찾기·휴지통/복원이 동작한다.
3. 본인 이미지 업로드·삽입·재조회가 되며 비로그인/다른 사용자에게 파일이 공개되지 않는다.
4. API 401/404, stale revision 409, 다른 사용자 리소스·위험 JSON/URL·잘못된 이미지 입력 거부를 의미 있는 테스트로 확인한다.
5. 현재 프런트엔드는 Node/JSDOM 기능 검증만 완료된 상태다. 브라우저 검증 도구가 현재 환경에 있으면 로그인→저장→새로고침→읽기 1회와 모바일 폭 1개만 확인한다. 도구가 없다면 대형 브라우저 도구를 새로 설치하지 말고 수동 확인 절차와 미검증을 보고한다.
6. `docs/implementation-status.md`에 완료·검증·미완료·다음에 읽을 파일을 간결하게 기록하고, 로컬 실행 명령을 README에 남긴다.

적용되는 커밋 규칙이 있으면 따른다. 변경을 검토 가능한 상태로 정리하되 사용자 변경까지 묶거나 git push하지 않는다. 자동 커밋 규칙이 없다면 커밋 여부와 변경 상태를 보고한다.

최종 보고는 20줄 이내: 구현 범위, 검증 결과, 실제 미완료·위험, 실행 명령, 변경/Git 상태. 작업 2나 배포로 자동 확장하지 않는다.
