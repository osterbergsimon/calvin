import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default [
  js.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.config.js",
      "vite.config.js",
      "src/api/types.ts",
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Allow single-word component names for views
      "vue/multi-word-component-names": [
        "error",
        {
          ignores: ["Dashboard", "Settings"],
        },
      ],
      // Allow unused variables that start with underscore
      // Note: Functions used in Vue templates may appear unused to ESLint
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Vue templates can reference functions that appear unused to ESLint
      "vue/no-unused-vars": "off",
      // Disable some Vue formatting rules that are too strict
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/html-indent": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/attributes-order": "off",
      "vue/v-on-event-hyphenation": "off",
    },
  },
];
