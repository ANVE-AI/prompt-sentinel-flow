import { SignIn } from "@clerk/clerk-react";
import { Logo } from "@/components/Logo";

const SignInPage = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-hero p-6">
    <div className="mb-8"><Logo /></div>
    <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/dashboard" />
  </div>
);

export default SignInPage;
