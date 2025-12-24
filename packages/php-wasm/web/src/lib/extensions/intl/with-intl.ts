import type {
	EmscriptenOptions,
	PHPRuntime,
	SupportedPHPVersion,
} from '@php-wasm/universal';
import { LatestSupportedPHPVersion, FSHelpers } from '@php-wasm/universal';
import { getIntlExtensionModule } from './get-intl-extension-module';
import { createMemoizedFetch } from '@wp-playground/common';

export async function withIntl(
	version: SupportedPHPVersion = LatestSupportedPHPVersion,
	options: EmscriptenOptions
): Promise<EmscriptenOptions> {
	const memoizedFetch = createMemoizedFetch(fetch);

	/*
	 * The Intl extension is hard-coded to look for the `icudt74l` filename,
	 * which means the ICU data file must use that exact name.
	 */
	const dataName = 'icudt74l.dat';
	const extensionName = 'intl.so';

	// @ts-ignore
	const dataPath = (await import('../../../../public/shared/icu.dat'))
		.default;
	const extensionPath = await getIntlExtensionModule(version);

	const [ICUData, extension] = await Promise.all([
		memoizedFetch(dataPath).then((response) => response.arrayBuffer()),
		memoizedFetch(extensionPath).then((response) => response.arrayBuffer()),
	]);

	return {
		...options,
		ENV: {
			...options.ENV,
			PHP_INI_SCAN_DIR: '/internal/private/extensions',
			ICU_DATA: '/internal/private',
		},
		onRuntimeInitialized: (phpRuntime: PHPRuntime) => {
			if (options.onRuntimeInitialized) {
				options.onRuntimeInitialized(phpRuntime);
			}
			/**
			 * The extension file previously read
			 * is written inside the /extensions directory
			 */
			if (
				!FSHelpers.fileExists(
					phpRuntime.FS,
					phpRuntime.ENV.PHP_INI_SCAN_DIR
				)
			) {
				phpRuntime.FS.mkdirTree(phpRuntime.ENV.PHP_INI_SCAN_DIR);
			}
			if (
				!FSHelpers.fileExists(
					phpRuntime.FS,
					`${phpRuntime.ENV.PHP_INI_SCAN_DIR}/${extensionName}`
				)
			) {
				phpRuntime.FS.writeFile(
					`${phpRuntime.ENV.PHP_INI_SCAN_DIR}/${extensionName}`,
					new Uint8Array(extension)
				);
			}
			/* The extension has its share of ini entries
			 * to write in a separate ini file
			 */
			if (
				!FSHelpers.fileExists(
					phpRuntime.FS,
					`${phpRuntime.ENV.PHP_INI_SCAN_DIR}/intl.ini`
				)
			) {
				phpRuntime.FS.writeFile(
					`${phpRuntime.ENV.PHP_INI_SCAN_DIR}/intl.ini`,
					[
						`extension=${phpRuntime.ENV.PHP_INI_SCAN_DIR}/${extensionName}`,
					].join('\n')
				);
			}
			/*
			 * An ICU data file must be loaded to support Intl extension.
			 * To achieve this, a shared directory is mounted and referenced
			 * via the ICU_DATA environment variable.
			 * By default, this variable is set to '/internal/private',
			 * which corresponds to the actual file location.
			 */
			if (
				!FSHelpers.fileExists(
					phpRuntime.FS,
					`${phpRuntime.ENV.ICU_DATA}/${dataName}`
				)
			) {
				phpRuntime.FS.mkdirTree(phpRuntime.ENV.ICU_DATA);
				phpRuntime.FS.writeFile(
					`${phpRuntime.ENV.ICU_DATA}/${dataName}`,
					new Uint8Array(ICUData)
				);
			}
		},
	};
}
