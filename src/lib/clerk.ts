// Clerk publishable key — provide via VITE_CLERK_PUBLISHABLE_KEY at build time,
// or paste it directly here. Until set, the app runs in "demo mode" with mock auth.
export const CLERK_PUBLISHABLE_KEY =
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? "";

export const isClerkConfigured = Boolean(CLERK_PUBLISHABLE_KEY);
