# SmartEditor 조사 요약

## 확인된 근거

- REA의 브라우저 연결과 편집기 탭 관찰은 성공했다.
- 접근성 관찰에서 제목·본문과 기본 삽입/서식 UI를 확인했다.
- 테스트 문자열은 서로 다른 accessibility node로 관찰됐지만, HTML 태그·클래스·인라인 스타일·`contenteditable` 위치는 확인되지 않았다.
- 재사용할 Evidence:
  - UI 접근성 관찰: `ev_4ce9087857b6d1762c0f539dbcdd8eb4102788af9c8514fb333df0f1eb3f006f`
  - 테스트 문단 관찰: `ev_881ac9c4dcb2d77127b36096c93fb5f21db7b134cfdae09667487906df856562`
  - 굵게 UI listener 집중 조회: `ev_99c7791a85b412070650f0c51d79684de0df80a0595bee151f4ab28adca68b84`

## 웹 번들 분석

- 최초 `analyze_web_bundle` 호출은 `detail: "summary"`에 필요한 명시적
  `javascript-routes` view가 없어 `invalid_request / invalid_input`으로 거부됐다.
- `view: {kind: "javascript-routes", collection: "summary"}`를 추가하고 불필요한
  `observation_ms`를 제거한 재호출은 기본 자원 제한으로 성공했다.
- summary receipt Evidence: `ev_79e7277a744e1edb5ecc1d5c8f708ecaf0770451469464bf8b1e1c00c8b72426`
- complete retained Evidence: `ev_700491b84e9a913ae55f7dfc44ada800039b2d9ce4f0659b8d0c31c376920b63`
- 제공된 code source의 parsing과 candidate enumeration은 complete이며,
  application route coverage는 unknown이다.
- source inventory에는 source digest 2개가 complete 상태로 관찰됐지만,
  URL·path·frame 식별 정보는 제공되지 않았다.
- `bold`, `contenteditable`, `paragraph` literal 추적은 이 web-bundle Evidence가
  `trace_application_feature`의 JavaScript Application Graph 입력이 아니어서 거부됐다.
- 따라서 본문 편집 진입점, 굵게 처리 코드, 문단·텍스트·서식 내부 표현의
  구체적인 코드 구간은 아직 미확인이다.
- 원본 bundle, 인증정보, 개인정보는 저장하지 않았다.

## 한계와 다음 참조

- 설치된 `analyze_web_bundle` 스키마에는 특정 script만 선택하는 입력 옵션이 없다.
- retained source view는 source 2개를 모두 열거했으며 둘 다 `status: complete`이다.
  그러나 두 row의 `url`, `path`, `container_sha256`, `base_path`는 `null`이고
  frame 식별 필드는 제공되지 않았다. 따라서 main/subframe 귀속과 SmartEditor 본체
  포함 여부는 현재 Evidence만으로 입증할 수 없다.
- retained web-bundle Evidence에서 지원되는 후속 view는 route/source inventory 중심이며,
  임의 literal의 코드 구간 조회는 이번 도구 조합으로 지원되지 않았다.
- 공식 후속 경로는 `inspect_web_page(include_script_sources: true)`의 complete page-inspection
  JSON capture를 로컬 파일로 보존하고, `export_web_scripts(capture_path, output_directory)`로
  script directory와 `analysis_input`을 만든 뒤 `analyze_javascript_application`에 전달하는 것이다.
  `export_web_scripts`는 기존 `analyze_web_bundle` retained Evidence ID를 직접 입력받지 않는다.
- 독립 구현에서는 네이버 코드를 복사하지 않고, 문단 block과 inline mark를 분리할지 별도로 설계 결정한다.

## 공식 export 및 Application Graph

- page-inspection capture Evidence:
  `ev_1b94ce5d4c424dc2d2c82eb2a458962e87e2c3ccf25c868871590910a0547b90`
- 임시 capture: `/tmp/smarteditor-rea-HnL2ff/page-inspection.json`
- `export_web_scripts` Evidence:
  `ev_b90ba473550cab78063db5ea745fc50296eb99a65b25090325e4472d36d9630d`
- export 경로: `/tmp/smarteditor-rea-HnL2ff/scripts`; 분석 입력은 그 아래 `files/` directory다.
- capture에 보존된 script 2개는 모두 export됐지만, 다른 origin 37개와 origin 미귀속
  5개 script는 정책 범위에서 제외됐다. script source truncation은 보고되지 않았다.
- Application Graph summary Evidence:
  `ev_291f87959b46b8d6487d2565061f28e66ee700a3b43d4791fdddb61047ea18cb`
- complete retained Application Graph:
  `ev_2bea8bdecc9006eaf2c9fecfdffbcdfa970447054d1ba4a72aa87cb7f577f5aa`
- Graph에는 isolated JavaScript source 2개가 module/asset으로 나타난다.
- complete source graph에서 `bold`, `contenteditable`, `paragraph` literal은 모두
  `no-match`였다. 각 trace Evidence는 순서대로
  `ev_da47b9f46e347a44ded5a3a136858de5fa5ac7edc60ce03ccf2205728146db62`,
  `ev_e29dcd49d43aa9c96fe7fcf8d34254565b3476d4feadf53882fa65844ab39eaf`,
  `ev_e81b15282ac41130248fb47594269bbaf3cb81c0b4788e3a424548b7ca6b1b06`이다.
- 따라서 현재 Graph에는 편집기 본체나 본문·서식 처리 코드가 포함됐다는 근거가 없다.
  제외된 script 범위 때문에 네이버 편집기 전체에서 해당 코드가 없다고 결론내릴 수는 없다.

## 제외 script 출처 확인

- 기존 capture의 completeness에는 `scripts/disallowed_origin: 37`과
  `scripts/unattributed_origin: 5`가 기록돼 있다.
- capture는 정책 밖 DOM URL 68개를 집계하지만 해당 URL 값은 `null`로 보존한다.
  `resources`와 response metadata도 비어 있어 제외 script의 정확한 host·path를
  기존 파일에서 복원할 수 없다.
- frame inventory에는 `blog.naver.com` origin의 main frame 1개와 하위 frame 2개가
  관찰됐다. export된 script 2개는 main frame에 귀속됐으며, 하위 frame script의
  포함 여부는 입증되지 않았다.
- `inspect_web_page`는 기본적으로 선택 target의 현재 origin만 허용하고,
  `allowed_origins`로 명시한 exact origin만 추가 보존한다. origin 미귀속 script는
  별도 허용 origin으로 포함시킬 근거가 없다.
- 따라서 편집기 정적 자산 origin을 근거 있게 특정할 수 없으며 wildcard나 네이버
  계열 전체 허용으로 확대하지 않았다. 보완 capture·export·Graph 생성도 실행하지 않았다.

## ssl.pstatic.net 허용 보완 분석

- 사용자 확인 근거에 따라 `allowed_origins`를 정확히
  `https://blog.naver.com`, `https://ssl.pstatic.net`으로 지정했다.
- 보완 capture Evidence:
  `ev_e323e30b596d79cd0721cf313b7f873491c061f0b7c0f64d2785f290cd2be5a5`
- capture에는 `blog.naver.com` script 2개와 `ssl.pstatic.net` script 1개가 포함됐다.
  다른 origin 36개와 origin 미귀속 15개는 계속 제외됐고 truncation은 없었다.
- REA session bundle을 `/tmp/smarteditor-rea-pstatic-e1iB9n/session-evidence.json`에
  직접 export하고, 해당 complete record를
  `/tmp/smarteditor-rea-pstatic-e1iB9n/page-inspection.json`으로 추출·검증했다.
- `export_web_scripts` Evidence:
  `ev_d079f710df4056643e45514d7476051ae686df2299b9f83351a2bc7abcb50461`
  분석 입력은 `/tmp/smarteditor-rea-pstatic-e1iB9n/scripts/files`이다.
- Application Graph 분석은 pstatic의
  `t.static.blog/mylog/versioning/Frameset-341345692_https.js`에서 기본 300초 제한으로
  timeout되어 coverage가 incomplete다. partial Evidence:
  `ev_6f5a5ba42d855fad9bbc7b6cdfa68b554c059372bbac16ef496ea96c86a6757b`;
  summary view Evidence: `ev_e1885972475e2adb2e409d1955e0663521431b4add16a345891692cf318a131a`.
- partial Graph에서 해당 파일은 JavaScript asset으로만 식별됐고 editor module이나
  본문·굵게·문단 서식 처리의 semantic 근거는 생성되지 않았다. `Frameset` 이름만으로
  SmartEditor 본체라고 판단하지 않는다.
