import { SignUp } from "@clerk/clerk-react";
import { Logo } from "@/components/Logo";

const SignUpPage = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-hero p-6">
    <div className="mb-8"><Logo /></div>
    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/dashboard" />
  </div>
);

export default SignUpPage;
