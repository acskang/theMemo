from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm, UserCreationForm


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
        self.fields["username"].label = "사용자 이름"
        self.fields["username"].widget.attrs.update({"autocomplete": "username", "autofocus": True})
        self.fields["password1"].label = "비밀번호"
        self.fields["password1"].widget.attrs["autocomplete"] = "new-password"
        self.fields["password2"].label = "비밀번호 확인"
        self.fields["password2"].widget.attrs["autocomplete"] = "new-password"


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
