// @ts-check
import eslint from '@antfu/eslint-config'

export default eslint(
	{
		test: false,
		ignores: [
			// eslint ignore globs here
		],
	},
	{
		rules: {
			'style/indent': ['error', 'tab'],
			'jsonc/indent': 'off',
			'style/no-tabs': 'off',
			'valid-typeof': 'off',
			'ts/no-require-imports': 'off',
			'no-new': 'off',
			'no-case-declarations': 'off',
			'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
		},
	},
)
