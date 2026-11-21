from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm, UserCreationForm
from django.core.exceptions import ValidationError


class MemoAuthenticationForm(AuthenticationForm):
    error_messages = {"invalid_login": "사용자 이름 또는 비밀번호가 올바르지 않습니다.", "inactive": "비활성화된 계정입니다."}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].label = "사용자 이름"
        self.fields["username"].widget.attrs.update({"autocomplete": "username", "autofocus": True})
        self.fields["password"].label = "비밀번호"
        self.fields["password"].widget.attrs["autocomplete"] = "current-password"


class MemoUserCreationForm(UserCreationForm):
    error_messages = {"password_mismatch": "두 비밀번호가 일치하지 않습니다."}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Temporary test-period relaxation: accept arbitrary ID characters and
        # weak passwords. Keep the database-backed username length limit.
        self.fields["username"].validators = []
        self.fields["username"].help_text = "150자 이하로 입력하세요. 이미 사용 중인 ID는 사용할 수 없습니다."
        self.fields["password1"].help_text = "테스트 기간에는 짧거나 단순한 비밀번호도 사용할 수 있습니다."
        self.fields["username"].label = "사용자 이름"
        self.fields["username"].widget.attrs.update({"autocomplete": "username", "autofocus": True})
        self.fields["password1"].label = "비밀번호"
        self.fields["password1"].widget.attrs["autocomplete"] = "new-password"
        self.fields["password2"].label = "비밀번호 확인"
        self.fields["password2"].widget.attrs["autocomplete"] = "new-password"

    def _get_validation_exclusions(self):
        # The built-in User model adds a username-character validator during
        # model validation; username syntax is intentionally unrestricted here.
        return super()._get_validation_exclusions() | {"username"}

    def clean_username(self):
        # Preserve unique IDs while allowing case variants during testing.
        username = self._meta.model.normalize_username(self.cleaned_data["username"])
        if self._meta.model._default_manager.filter(username=username).exists():
            raise ValidationError(self.instance.unique_error_message(self._meta.model, ["username"]))
        return username

    def validate_password_for_user(self, user, password_field_name="password2"):
        # Password confirmation remains required, but configured strength
        # validators are bypassed on account creation for the test period.
        return


class MemoPasswordChangeForm(PasswordChangeForm):
    error_messages = {**PasswordChangeForm.error_messages, "password_incorrect": "현재 비밀번호가 올바르지 않습니다.", "password_mismatch": "두 새 비밀번호가 일치하지 않습니다."}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["old_password"].label = "현재 비밀번호"
        self.fields["old_password"].widget.attrs.update({"autocomplete": "current-password", "autofocus": True})
        self.fields["new_password1"].label = "새 비밀번호"
        self.fields["new_password1"].widget.attrs["autocomplete"] = "new-password"
        self.fields["new_password2"].label = "새 비밀번호 확인"
        self.fields["new_password2"].widget.attrs["autocomplete"] = "new-password"
