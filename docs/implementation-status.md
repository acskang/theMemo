# 구현 상태

## 완료

- 기존 `publishing/index.html` 마크업과 dist manifest를 Django template/static에 연결했다.
- 표준 로그인, owner 범위 Note/Notebook/MemoImage, revision 조건부 저장, 기본 메모장을 구현했다.
- Tiptap JSON/링크/이미지 allowlist와 5MB·형식·픽셀 이미지 검증, 인증된 이미지 응답을 구현했다.
- 즐겨찾기·휴지통/복원·태그·일기 중복은 동일 snapshot 저장 계약으로 처리한다.
- 명시적 저장 버튼은 성공 후 블로그 목록으로 이동하며, 자동 저장과 Ctrl/Cmd+S는 편집 화면을 유지한다.
- API 오류 응답의 안전한 서버 메시지를 표시해 저장 실패 시 편집 내용과 화면을 유지한다.
- 실제 실패 snapshot에서 확인한 Tiptap unset `textStyle` 빈 문자열과 표 셀 `align` attribute를 각 속성의 제한된 값으로 검증·보존한다.
- clipboard 이미지 파일은 기존 소유 이미지 업로드로, `i.ytimg.com/vi/` HTML 썸네일은 제한된 서버 import 후 보호 URL로 붙여넣는다.
- HTML paste는 실행 요소·이벤트·외부 스타일을 제거하면서 일반 텍스트·안전 링크·표를 유지하고, 파일과 HTML이 함께 오면 파일만 한 번 삽입한다.
- 기존 외부 이미지 문서는 “이미지 다시 가져오기”로 보호 URL과 정상 이미지 attributes로 복구하며, 진행 중 저장은 대기하고 실패 시 편집 화면을 보존한다.
- YouTube `hq720.jpg` URL의 `sqp`·`rs` query는 값 형식과 중복을 검증해 허용하며, host·경로·port·userinfo 제한은 유지한다.
- YouTube가 `.jpg` URL에 AVIF를 반환하면 Pillow 실제 format·decode를 확인한 뒤 alpha 없는 이미지는 JPEG, alpha 이미지는 PNG로 변환하고 변환 결과도 용량·픽셀·decode를 재검증한다.
- 붙여넣은 썸네일은 가장 가까운 YouTube anchor 또는 검증된 `i.ytimg.com/vi|vi_webp/<ID>/`에서 정규화한 영상 링크를 이미지 `linkUrl`에 저장한다.
- 작성 화면은 이미지 선택 동작을 유지하고, 블로그·읽기 화면만 보호 이미지에 새 탭 YouTube 링크를 렌더링한다.
- Django 세션 인증을 재사용해 한국어 로그인·회원가입·비밀번호 변경 화면과 CSRF POST 로그아웃을 연결했다.
- 가입·비밀번호 변경에는 Django 기본 비밀번호 정책을 적용하고, 앱 계정 메뉴에서 비밀번호 변경과 로그아웃에 접근할 수 있다.
- `/` 공개 블로그와 `/blog/<글 ID>/` 읽기 화면을 추가하고, 명시적으로 공개한 비휴지통·제목 있는 글만 익명 조회하도록 분리했다.
- 공개 문서가 실제 참조하는 보호 이미지만 익명 조회할 수 있으며 공개 해제·휴지통 전환 즉시 이미지 접근도 차단한다.

## 검증

- `uv run python manage.py check`
- `uv run python manage.py migrate`
- `uv run python manage.py test notes`
- API 테스트는 인증/CSRF, owner 은닉, stale revision, JSON·URL 거부, 이미지 위장·용량·비공개, 일기 중복을 포함한다.
- 프런트 테스트에 저장 성공 목록 이동, 자동/단축키 저장 화면 유지, 실패 시 이동 금지를 추가했다.
- unset `textStyle`과 표 셀 `align: null` 저장·재조회 구조 보존, 위험한 정렬 값 거부 회귀 테스트를 추가했다.
- 서버 14개 테스트와 Django check가 통과했다. 외부 fetch는 mock으로 허용 host, redirect, 사설 IP, 용량, 이미지 내용을 검증했다.
- 프런트 9개 테스트가 통과했다. 파일/HTML/동시 paste, 텍스트·링크·표 보존, 저장·충돌 동작을 포함한다.
- 링크로 감싼/링크 없는/복수 썸네일, 파일+HTML 중복 방지, 비동기 교체·저장·재조회, 위험 링크 거부와 read-only 렌더링을 검증했다.
- 실제 `paste-failure-note.json`을 보호 URL·정상 attributes로 변환한 복사본이 검증·저장·재조회됨을 rollback transaction에서 확인했다.
- `npm run build`로 manifest와 dist/preview 산출물을 갱신했다.
- 보존된 실제 720×404 AVIF 응답을 JPEG로 변환해 import API 201, 보호 URL 200, 재디코딩 성공을 임시 media와 rollback transaction으로 확인했다.
- 인증 테스트는 가입 성공·중복·약한 비밀번호, 로그인 성공·실패·외부 next 차단, POST/CSRF 로그아웃, 비밀번호 변경 후 세션 유지, 신규 사용자 owner 격리를 포함하며 전체 21개가 통과했다.
- 공개 목록·상세·연결 이미지, 비공개·휴지통·제목 없는 글·미연결 이미지 차단과 공개 해제 회귀를 포함한 Django 테스트 22개가 통과했다.

## 미완료

- `deploy/production/`에 memo 전용 Gunicorn/systemd, Nginx, 원격 관리형 `www` Tunnel ingress 예시, 환경파일 예시와 롤백 문서를 준비했다. 운영 설정은 별도 `theMemo.settings_prod`로 분리했다.
- 배포 전 백업은 `backups/predeploy-20261111-101151/`에 생성했으며 migration plan은 변경 없음, 프런트 test/build와 `collectstatic`은 완료했다.
- 제한된 실행 환경의 DNS 실패로 Gunicorn lock/install과 sudo 기반 systemd/Nginx 적용, Cloudflare dashboard hostname 등록은 아직 수행하지 못했다.
- 자동 브라우저 도구가 없어 로그인→저장→새로고침→읽기 및 모바일 폭 시각 검증은 수동 확인이 필요하다.
- 실제 YouTube clipboard와 로컬 Django 화면의 브라우저 수동 검증은 미완료다.
- 배포와 작업 2는 범위 밖이다.

## 다음에 읽을 파일

- `publishing/docs/CODEX_PROMPT_01.md`
- `publishing/docs/DJANGO_INTEGRATION.md`
- `notes/views.py`, `notes/validation.py`, `notes/tests.py`
