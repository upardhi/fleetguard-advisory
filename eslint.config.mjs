import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
  ]),
  {
    // ── Safety rule S1: no bare non-fg_* collection string literals ──────────
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Catches: collection(db, "users") / collection(db, 'trips') etc.
          // Does NOT flag: collection(db, "fg_users") or collection(db, FG_USERS)
          selector:
            "CallExpression[callee.name='collection'] > Literal:nth-child(2)[value!=/^fg_/]",
          message:
            "Firestore collection names must start with 'fg_' (FleetGuard safety rule S1). " +
            "Use the constants from app/_lib/fg-paths.ts instead of bare string literals.",
        },
      ],
    },
  },
  {
    // ── Safety rule S8: firebaseAdmin only importable inside app/api/ ────────
    // app/_server/** is the new Supabase server layer — it never imports firebaseAdmin.
    files: ["app/**/*.ts", "app/**/*.tsx"],
    ignores: ["app/api/**", "app/_server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/firebaseAdmin", "**/_lib/firebaseAdmin"],
              message:
                "firebaseAdmin (Firebase Admin SDK) may only be imported inside app/api/. " +
                "This is FleetGuard safety rule S8.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
