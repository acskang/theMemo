# theMemo 로컬 MVP

승인된 `publishing/` 스마트메모 UI를 Django 인증·저장 API에 연결한 로컬 MVP입니다.

## 실행

```bash
uv sync
uv run python manage.py migrate
uv run python manage.py createsuperuser
uv run python manage.py runserver 127.0.0.1:8000
```

브라우저에서 <http://127.0.0.1:8000/>에 접속해 생성한 운영자 계정으로 로그인합니다. 공개 회원가입은 제공하지 않습니다.

검증은 `uv run python manage.py check`와 `uv run python manage.py test notes`로 실행합니다. `DJANGO_SECRET_KEY`와 `DJANGO_ALLOWED_HOSTS`는 외부 환경에서 주입하며, 기본 키는 로컬 개발 전용입니다.
