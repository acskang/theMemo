# 구현 상태 (status.md)

## 완료
 - 마이그레이션 0001~0005 모두 적용됨 (2026-11-12 DB 초기화 후 migrate 완료). AppSetting, FeatureFlag, MenuItem, UIString의 id는 BigAutoField. makemigrations --check 결과 변경 없음.

## 미완료
  - 이미지 이름 편집 화면(I2) 미구현, 관리자 목록과 API 브라우저 실기 확인 미실시
  - 이미지 이름 입력칸 브라우저 실기 확인(선택, 입력, Enter/blur/Esc, 오류, 360px 폭) 미실시

  - 사용 안내/사용자 메뉴 이동 브라우저 실기 확인(헤더 드롭다운, 사이드바 사용 안내, 360px 폭, 로그아웃) 미실시
  - 메모장 이름 변경 화면(N2) 미구현, 서버 API와 어댑터만 완료

## 다음에 읽을 파일
- (없음)