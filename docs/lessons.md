# Lessons (누적 교훈)

> - 에이전트는 작업 시작 시 이 파일의 앞 30줄("활성 규칙")만 읽는다. 전체를 읽지 않는다.
> - 활성 규칙은 최대 10개, 한 줄씩 쓴다. 기록으로 승격된 항목은 "기록"에서 지운다.
> - 새 교훈은 "기록" 맨 위에 추가한다. 형식: `### 날짜 | 제목` + 증상/원인/해결/규칙 (5줄 이내).
> - 같은 실수가 반복되거나 영향이 크면 활성 규칙으로 승격한다. 파일은 100줄 안팎을 유지한다.

## 활성 규칙
1. 외부 입력(파일·URL·HTML·이미지)은 이름·확장자·Content-Type을 믿지 말고 실제 내용을 검증한다. 변환했다면 변환 결과도 다시 검증한다.
2. 검증(allowlist)을 조이기 전에 에디터가 실제로 내보내는 JSON이나 실패 snapshot으로 먼저 테스트한다.
3. 서버의 외부 URL fetch는 host allowlist, redirect 제한, 사설 IP 차단, 용량 제한을 모두 적용한다. 테스트는 mock으로 하고 실제 네트워크를 호출하지 않는다.
4. 공개 조회는 "명시적 공개 + 비휴지통 + 제목 있는 글"만 허용한다. 공개 문서가 참조하는 이미지만 익명 조회를 허용하고, 공개 해제·휴지통 이동 시 즉시 차단한다. 타인 소유 자원은 404로 응답한다.
5. 저장은 revision 조건부이며 stale revision은 충돌로 처리한다. 명시적 저장 성공 시 목록 이동, 자동 저장·Ctrl/Cmd+S는 편집 화면 유지, 실패 시 이동 금지와 내용 보존, 안전한 서버 메시지만 표시한다.
6. HTML 붙여넣기는 실행 요소·이벤트 속성·외부 스타일을 제거하고 텍스트·안전 링크·표를 유지한다. 파일과 HTML이 함께 오면 파일만 한 번 삽입한다.
7. 실데이터 검증은 rollback transaction과 임시 media 디렉터리로 하여 운영 데이터를 오염시키지 않는다.
8. 분석 결과가 no-match나 incomplete면 "없다"고 결론내지 않는다. 수집 범위와 completeness를 확인하고, 파일명만으로 역할을 단정하지 않는다.
9. 실행하지 않은 검증은 "확인함"으로 쓰지 않는다. `docs/status.md`의 미완료에 사유와 함께 적는다.
10. (임시) 모든 작업의 첫 응답 첫 줄에 [LESSONS-OK]를 출력한다.

## 기록

### 2026-11-11 | Tiptap 저장이 검증에서 거부됨
- 증상: unset `textStyle` 빈 문자열, 표 셀 `align: null`이 거부됨
- 해결: 실제 실패 snapshot으로 각 속성의 제한된 값만 허용하도록 수정, 회귀 테스트 추가
- 규칙: 활성 규칙 2

### 2026-11-11 | YouTube가 .jpg URL에 AVIF를 반환
- 해결: Pillow로 실제 format·decode 확인 후 alpha 없음은 JPEG, alpha 있음은 PNG로 변환
- 규칙: 변환 결과도 용량·픽셀·decode를 재검증한다 (활성 규칙 1)

### 2026-11-11 | 웹 번들·편집기 코드 분석 도구 사용법 (SmartEditor 조사)
- `analyze_web_bundle`의 summary는 `view: {kind: "javascript-routes", collection: "summary"}`가 필수이고 불필요한 `observation_ms`는 제거한다
- literal 추적은 web-bundle Evidence로 불가: `inspect_web_page(include_script_sources: true)` → `export_web_scripts` → `analyze_javascript_application` 순서로 진행
- 다른 origin script는 기본 제외(`disallowed_origin`): `allowed_origins`에 정확한 origin만 지정하고 wildcard는 금지
- 큰 파일은 기본 300초 timeout으로 incomplete가 될 수 있다
- 상세: `docs/research/smarteditor-analysis.md`

### 2026-11-11 | 샌드박스 DNS·권한 제한
- 증상: DNS 실패로 패키지 설치와 sudo 기반 systemd/Nginx 적용 불가
- 규칙: 못 한 작업은 미완료에 사유와 함께 적는다 (활성 규칙 9)

