import ForgotPasswordPage from "@/app/auth/forgot-password/page";
import ResetPasswordPage from "@/app/auth/reset-password/page";
import VerifyEmailPage from "@/app/auth/verify-email/page";

export function ForgotPasswordRoutePage() {
  return <ForgotPasswordPage />;
}

export function ResetPasswordRoutePage() {
  return <ResetPasswordPage />;
}

export function VerifyEmailRoutePage() {
  return <VerifyEmailPage />;
}
