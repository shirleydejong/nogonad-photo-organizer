
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import typescriptEslint from 'typescript-eslint';

export default [
	{
		ignores: [
			'.next/**',
			'out/**',
			'build/**',
			'next-env.d.ts',
			'node_modules/**',
		],
	},
	js.configs.recommended,
	...typescriptEslint.configs.recommended,
	{
		plugins: {
			'@next/next': nextPlugin,
		},
		rules: {
			...nextPlugin.configs.recommended.rules,
			indent: [
				'error',
				'tab',
				{
					ignoreComments: true,
					SwitchCase: 1,
				},
			],
			'no-lonely-if': ['error'],
			'linebreak-style': ['warn', 'unix'],
			quotes: [
				'error',
				'single',
				{
					allowTemplateLiterals: true,
					avoidEscape: true,
				},
			],
			semi: ['error', 'always'],
			'no-prototype-builtins': ['off'],
			'default-case': ['error'],
			'default-case-last': ['error'],
			curly: ['error'],
			'no-else-return': ['error'],
			'no-eval': ['error'],
			'no-multi-assign': ['error'],
			'no-trailing-spaces': [
				'warn',
				{
					skipBlankLines: true,
					ignoreComments: true,
				},
			],
			'no-unused-vars': ['warn'],
			'no-unreachable': ['warn'],
			'space-before-function-paren': ['error', 'never'],
			'keyword-spacing': [
				'error',
				{
					before: true,
					after: true,
					overrides: {
						if: { before: true, after: false },
						for: { before: true, after: false },
						switch: { before: true, after: false },
						else: { before: true, after: true },
					},
				},
			],
		},
	},
];
