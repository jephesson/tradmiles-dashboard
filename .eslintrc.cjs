// .eslintrc.cjs
module.exports = {
  extends: ["next/core-web-vitals"],
  rules: {
    // Durante a migração de tipos
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/ban-ts-comment": ["warn", { "ts-expect-error": "allow-with-description" }],
    "prefer-const": "warn",
    "@next/next/no-img-element": "warn"
  }
};
