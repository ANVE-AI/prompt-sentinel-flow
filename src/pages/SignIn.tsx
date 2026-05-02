import { SignIn } from "@clerk/clerk-react";
import { Logo } from "@/components/Logo";
import { AuthShowcasePane } from "@/components/auth/AuthShowcasePane";

const SignInPage = () => (
  <div className="min-h-screen grid lg:grid-cols-[480px_1fr] bg-background">
    <div className="flex flex-col px-8 py-10 lg:px-12 lg:py-14">
      <Logo />
      <div className="flex-1 flex flex-col justify-center max-w-sm w-full mt-10 lg:mt-0 mx-auto lg:mx-0">
        <h1 className="text-h1 font-semibold tracking-tight mb-1">Welcome back</h1>
        <p className="text-body text-muted-foreground mb-7">Sign in to your AnveGuard console.</p>
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          forceRedirectUrl="/dashboard"
          appearance={{ elements: { rootBox: "w-full", card: "shadow-none border-none bg-transparent" } }}
        />
      </div>
    </div>
    <AuthShowcasePane />
  </div>
);

export default SignInPage;
