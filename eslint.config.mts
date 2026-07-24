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
		// `brands` option preserves brand casing instead of flagging it. Since `brands`
		// replaces rather than merges the rule's own default list, "Obsidian" is repeated
		// here too so it keeps its default exemption. enforceCamelCaseLower mirrors the
		// recommended preset's default so no other sentence-case behavior changes.
		rules: {
			'obsidianmd/ui/sentence-case': ['warn', { brands: ['Ribbon Organizer', 'Obsidian'], enforceCamelCaseLower: true }],
		},
	},
	{
		// The tab implements getSettingDefinitions() (1.13+ declarative path, satisfies
		// prefer-setting-definitions) AND keeps display() as the official fallback for
		// Obsidian < 1.13 — minAppVersion is 1.8.7 and the docs sanction exactly this:
		// "Only implement display() as a fallback for plugins that need to support Obsidian
		// versions older than 1.13.0." Overriding it still trips @typescript-eslint/no-deprecated;
		// eslint-comments/no-restricted-disable forbids an inline disable, so the rule is
		// scoped off for this file instead.
		files: ['src/ui/SettingTab.ts'],
		rules: {
			'@typescript-eslint/no-deprecated': 'off',
		},
	},
);
