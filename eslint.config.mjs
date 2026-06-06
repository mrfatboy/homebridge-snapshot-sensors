import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

// All formatting (quotes, semicolons, indentation, line wrapping, object
// expansion, etc.) is delegated to Prettier — see .prettierrc.json. ESLint
// here only enforces code-quality rules. The `prettier` config at the end of
// the export disables any ESLint rules that would conflict with Prettier.
const sharedRules = {
  ...tsPlugin.configs['recommended'].rules,
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
};

export default [
  {
    ignores: ['dist/', 'node_modules/'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: sharedRules,
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: sharedRules,
  },
  prettier,
];
