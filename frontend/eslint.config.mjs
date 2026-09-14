import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // `no-undef` is OFF in eslint-config-next, because it is redundant under
    // TypeScript and that is what the config is tuned for. This project is
    // plain JS, so nothing else checks that an identifier exists — and a
    // reference to a variable that was renamed out from under it compiles
    // cleanly, builds cleanly, and throws the moment the component renders.
    //
    // That happened: a local `framing` was renamed to `initial` and one JSX
    // usage was missed. `npm test` and `npm run build` both passed and the app
    // was a blank screen with a ReferenceError. This rule is the only thing in
    // the toolchain that catches that class.
    files: ["src/**/*.{js,jsx,mjs}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: { "no-undef": "error" },
  },
]);

export default eslintConfig;
