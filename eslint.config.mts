import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'dev',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'vitest.config.ts'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// "Ribbon Organizer" is the plugin's proper-noun name; the sentence-case rule's
		// `brands` option preserves brand casing instead of flagging it. enforceCamelCaseLower
		// mirrors the recommended preset's default so no other sentence-case behavior changes.
		rules: {
			'obsidianmd/ui/sentence-case': ['warn', { brands: ['Ribbon Organizer'], enforceCamelCaseLower: true }],
		},
	},
	{
		// SettingTab renders a custom interactive reorderable list (move/remove rows,
		// inline command/icon pickers) that the declarative getSettingDefinitions API cannot
		// express, so display() is the correct approach here. That override necessarily calls
		// the inherited display() (deprecated since Obsidian 1.13, replaced by
		// getSettingDefinitions); this plugin's minAppVersion is 1.8.7, so the deprecated path
		// is unavoidable. eslint-comments/no-restricted-disable forbids an inline disable for
		// either rule, so both are scoped off for this file instead.
		files: ['src/ui/SettingTab.ts'],
		rules: {
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
			'@typescript-eslint/no-deprecated': 'off',
		},
	},
);
