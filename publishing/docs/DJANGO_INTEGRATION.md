# Django 연결 계약 v1

이 문서는 현재 프런트엔드와 일치하는 서버 계약이다. 구현되지 않은 서버의 동작을 보장하는 문서가 아니다.

## 템플릿·정적 파일 연결

1. `publishing/index.html`을 기반으로 `templates/memo/app.html`을 만든다. 마크업·클래스·ID·data-* hook을 보존한다.
2. 소스의 `/src/main.js` 스크립트와 CSS 빌드 연결은 배포 번들로 대체한다. `preview.html`을 템플릿으로 쓰지 않는다.
3. `publishing/dist/.vite/manifest.json`의 `index.html` entry에서 `file`과 `css`를 읽는다. hashed filename을 수작업으로 고정하지 않는다.
4. Django `STATICFILES_DIRS`에 `('memo', BASE_DIR / 'publishing' / 'dist')`를 등록할 수 있다. JS/CSS는 `{% static 'memo/' %}` prefix + manifest 경로로 연결한다. favicon은 동일 static prefix 아래 assets/favicon.svg.
5. manifest는 서버 코드에서 캐시해 읽고 template context로 전달한다. 매 요청 npm build를 실행하지 않는다. manifest가 없으면 명확한 구성 오류를 알린다.
6. 기존 `<script id="smartmemo-config" …>`를 제거하고 view가 만든 dictionary를 Django `json_script`로 출력한다. 중복 id 금지.

예시 bootstrap dictionary:

```json
{
  "mode": "django",
  "apiBase": "/api/memo",
  "assetBase": "/static/memo/assets/",
  "initialNoteId": null
}
```

템플릿 표현 예: `{{ memo_config|json_script:"smartmemo-config" }}`.
`{% csrf_token %}`을 hidden form 안에 넣거나 CSRF cookie를 설정한다. HttpOnly CSRF cookie를 사용할 때는 hidden token을 사용한다. 로그인 뒤 정상 페이지에는 demo mode를 출력하지 않는다.

HTMX는 편집 중 `#editor`, `#document-title`, `#reader-content`를 교체하지 않게 한다. 앱 shell은 일반 navigation으로 시작해도 충분하다. SPA로 재설계하거나 HTMX를 쓰기 위해 불필요한 partial을 만들 필요 없다. 동적 unmount를 추가한다면 저장 완료 확인 후 `window.SmartMemo.destroy()`를 사용한다. 현재 전역 이벤트는 전체 페이지 수명 기준이므로 동일 문서에서 앱 재마운트가 필요하면 listener cleanup도 보완한다.

## 데이터 형태

Note JSON은 다음 필드를 사용한다. 모델과 DTO의 이름을 다르게 할 경우 serializer에서 변환한다.

```json
{
  "id": "uuid",
  "title": "메모 제목",
  "notebook_id": "uuid",
  "tags": ["일상", "생각"],
  "document_date": "2026-11-10",
  "daily_key": null,
  "favorite": false,
  "deleted": false,
  "schema_version": 1,
  "revision": 3,
  "content": {"type":"doc","content":[{"type":"paragraph"}]},
  "plain_text": "서버에서 재생성할 검색용 텍스트",
  "icon": "",
  "cover": null,
  "created_at": "2026-11-10T01:30:00+00:00",
  "updated_at": "2026-11-10T01:31:00+00:00"
}
```

- id는 클라이언트가 새 메모 생성 시 UUID를 미리 정한다. 서버도 UUID 유효성을 검사한다.
- `revision=0`은 생성 요청. 생성 성공 후 revision=1. 갱신 요청은 현재 revision을 보낸다.
- 서버가 owner·created_at·updated_at·plain_text를 결정한다. 요청값으로 owner를 지정할 수 없다.
- title 최대 200자, tags 최대 10개·각 30자, icon은 짧은 문자열, JSON 크기·깊이·노드 수 제한.
- notebook은 동일 owner 소유여야 한다. 초기 메모장은 일상 기록/개발 노트/아이디어/읽고 배운 것 4개를 idempotent하게 준비한다. 운영 샘플 일기는 생성하지 않는다.
- daily_key는 오늘의 일기 키(YYYY-MM-DD)이며 일반 메모에는 null. 같은 owner의 활성 일기에 유일성을 보장한다. 필요 시 date 변경 정책을 명시한다. 삭제된 일기 복원과 중복되는 경우 409 처리.
- 브라우저 데모는 전체 목록을 받아 로컬 검색한다. 초기 개인 MVP도 동일하게 시작할 수 있다. 규모 확장 때 서버 pagination/filter와 프런트엔드를 함께 변경한다.

## HTTP 엔드포인트

모든 API는 인증 필수, JSON 응답. 로그인 HTML로 redirect하지 않는다.

| 메서드·주소 | 요청 | 응답 |
|---|---|---|
| GET `/api/memo/notes/` | 없음 | `{ "items": [Note, ...] }` — 본인 활성·휴지통 포함 |
| PUT `/api/memo/notes/<uuid>/` | 전체 Note snapshot + revision | 저장된 Note 단일 객체 |
| GET `/api/memo/notebooks/` | 없음 | `{ "items": [{"id":"uuid","name":"일상 기록"}] }` |
| POST `/api/memo/notebooks/` | `{ "name": "여행 기록" }` | 생성된 `{id,name}` |
| POST `/api/memo/images/` | multipart `file` | `{ "id":"uuid", "url":"/memo-media/<uuid>/", "original_name":"photo.png" }` |
| GET `/memo-media/<uuid>/` | 없음 | 인증·소유권 확인한 이미지 FileResponse |

권장 상태: 미인증 401, CSRF/권한 403, 다른 사용자 리소스 404, revision/일기 중복 409, 잘못된 입력 400, 너무 큰 파일 413. 에러는 `{ "error": {"code":"…", "message":"…"} }`. 프런트엔드는 상태별 고정 사용자 메시지를 제공하므로 개인정보가 포함된 원문 오류를 반환하지 않는다.

## 저장 순서·충돌

서버의 update는 owner와 revision을 조건으로 원자적으로 수행한다. ‘읽어서 비교 → 조건 없는 save’는 금지. 조건부 UPDATE나 해당 DB에서 검증된 동시성 전략을 사용한다. 원래 revision과 다르면 409이며 기존 내용을 덮지 않는다. 성공 응답은 증가한 revision과 서버 updated_at을 포함한다.

프런트엔드는 저장 요청을 직렬화하고 요청 중 생긴 변경은 다음 snapshot으로 저장한다. 409면 편집 내용 유지·화면 이동 차단·JSON 보관 버튼을 제공한다. 완전한 자동 병합이나 충돌 비교 화면은 현재 범위가 아니다.

자동 저장는 1.5초 debounce, 한글 조합 중 지연. 서버 저장 성공 전 ‘서버 저장됨’ 표시 금지. Django 모드에는 아직 IndexedDB 영속 초안이 없으므로 서버 실패 시 현재 화면에서 JSON 보관을 제공하고, 다음 단계에서 owner-scoped 복구 저장을 추가한다.

## JSON·렌더링

실제 노드·mark는 `src/editor.js`의 확장 조합으로 정한다. 최소 허용 노드: doc, paragraph, text, heading(level 2/3/4), hardBreak, bulletList, orderedList, listItem, taskList, taskItem, blockquote, codeBlock, horizontalRule, image, table, tableRow, tableHeader, tableCell. marks: bold, italic, underline, strike, code, link, textStyle, highlight.

속성 역시 allowlist로 검증한다. heading level, 목록 시작값, table span, task checked, textStyle의 fontFamily/fontSize/color/backgroundColor/lineHeight, textAlign, code language 등을 실제 생성 JSON에 맞춰 제한한다. mark의 URL과 이미지 참조는 별도 검증한다. 지원하지 않는 노드·임의 HTML·onerror 등 속성을 그대로 저장·실행하지 않는다.

초기 읽기 화면은 동일 JSON을 read-only Tiptap에 전달하므로 별도 HTML 생성 서비스를 만들 필요 없다. 검색 text는 서버가 노드를 순회해 추출한다. 나중에 서버 HTML을 도입할 경우 정해진 스키마로 생성하고 정제한다.

## 이미지·비공개

- 클라이언트 accept/MIME 검사를 신뢰하지 않는다. Pillow 등으로 파일 내용을 검증한다. 5MB·픽셀 수·형식 한도를 정하고 SVG·HTML 파일을 허용하지 않는다.
- 파일명은 UUID 기반으로 저장하고, 경로 탐색 문자를 원본 이름에서 저장 경로로 쓰지 않는다.
- 개발 환경에서도 인증을 우회하는 공개 `MEDIA_URL` 전체 서빙은 하지 않는다. 파일은 보호된 경로에서 소유권을 확인하고 응답한다.
- 운영 content/cover에는 본인 업로드 이미지의 보호 URL만 허용한다. `data:` demo 이미지, 임의 외부 이미지, 다른 사용자 이미지 참조는 거부한다. demo seed를 운영에 넣지 않는다.
- 링크는 http/https만 허용하고 출력은 외부 링크 rel=noopener noreferrer.
- 업로드만 되고 메모에 삽입되지 않은 파일은 초기에 삭제하지 않아도 되지만 추후 orphan 정리 정책을 둔다. 파일 첨부 일반 기능은 아직 범위 밖.

## 기본 필수 검증

미인증 app 접근·API 거부, 본인 저장·재조회, 다른 사용자 note/notebook/image 은닉, stale revision 409와 기존 내용 보존, JSON 스키마·URL 거부, 이미지 MIME 위장/용량 거부, 비공개 이미지 접근, 즐겨찾기·휴지통 복원, 일기 중복 정책. 장식 CSS snapshot을 만들기보다 데이터 손실·접근권한·입력검증에 집중한다.
