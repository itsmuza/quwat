import eslint from '@eslint/js';
import parser from '@typescript-eslint/parser';
import plugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import prettier from 'eslint-plugin-prettier/recommended';

export default [
	{ ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
	{
		files: ['apps/**/*.ts'],
		languageOptions: {
			parser,
			parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
			globals: { ...globals.node, ...globals.jest },
		},
		plugins: { '@typescript-eslint': plugin },
		rules: {
			...eslint.configs.recommended.rules,
			...plugin.configs.recommended.rules,
			'no-undef': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
			],
		},
	},
	{ ...prettier, files: ['apps/**/*.ts'] },
];
