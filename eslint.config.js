import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // tailwind.config.ts uses require() for the typography plugin — standard
  // Tailwind pattern, not worth fighting. Same for build/dist.
  { ignores: ["dist", "tailwind.config.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // `no-explicit-any` is currently demoted to warn — flipping it to error
      // surfaces ~350 violations (the C2 audit finding "TS strict mode disabled
      // → 16+ call<any> sites + dozens of catch (e: any)"). Cleanup is part of
      // the planned C2 strict-TS migration; until then we want CI to pass and
      // surface the gap as a warning count rather than block every push.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
