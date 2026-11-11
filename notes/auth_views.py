from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import LoginView, PasswordChangeView
from django.urls import reverse_lazy
from django.views.generic import FormView

from .forms import MemoAuthenticationForm, MemoPasswordChangeForm, MemoUserCreationForm


class MemoLoginView(LoginView):
    template_name = "registration/login.html"
    authentication_form = MemoAuthenticationForm
    redirect_authenticated_user = True


class SignUpView(FormView):
    template_name = "registration/signup.html"
    form_class = MemoUserCreationForm
    success_url = reverse_lazy("login")

    def form_valid(self, form):
        form.save()
        messages.success(self.request, "회원가입이 완료되었습니다. 로그인해 주세요.")
        return super().form_valid(form)


class MemoPasswordChangeView(LoginRequiredMixin, PasswordChangeView):
    template_name = "registration/password_change.html"
    form_class = MemoPasswordChangeForm
    success_url = reverse_lazy("password-change")

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, "비밀번호가 변경되었습니다.")
        return response
