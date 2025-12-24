import type {
	EmscriptenOptions,
	PHPRuntime,
	SupportedPHPVersion,
} from '@php-wasm/universal';
import { LatestSupportedPHPVersion, FSHelpers } from '@php-wasm/universal';
import fs from 'fs';
import { getXdebugExtensionModule } from './get-xdebug-extension-module';

export interface XdebugOptions {
	ideKey?: string;
}

export async function withXdebug(
	version: SupportedPHPVersion = LatestSupportedPHPVersion,
	options: EmscriptenOptions,
	xdebugOptions?: XdebugOptions
): Promise<EmscriptenOptions> {
	const fileName = 'xdebug.so';
	const filePath = await getXdebugExtensionModule(version);
	const extension = fs.readFileSync(filePath);

	return {
		...options,
		ENV: {
			...options.ENV,
			PHP_INI_SCAN_DIR: '/internal/private/extensions',
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
					`${phpRuntime.ENV.PHP_INI_SCAN_DIR}/${fileName}`
				)
			) {
				phpRuntime.FS.writeFile(
					`${phpRuntime.ENV.PHP_INI_SCAN_DIR}/${fileName}`,
					new Uint8Array(extension)
				);
			}
			/* The extension has its share of ini entries
			 * to write in a separate ini file
			 */
			if (
				!FSHelpers.fileExists(
					phpRuntime.FS,
					`${phpRuntime.ENV.PHP_INI_SCAN_DIR}/xdebug.ini`
				)
			) {
				const ideKey = xdebugOptions?.ideKey || 'PHPWASMCLI';
				phpRuntime.FS.writeFile(
					`${phpRuntime.ENV.PHP_INI_SCAN_DIR}/xdebug.ini`,
					[
						`zend_extension=${phpRuntime.ENV.PHP_INI_SCAN_DIR}/xdebug.so`,
						'xdebug.mode=debug,develop',
						'xdebug.start_with_request=yes',
						`xdebug.idekey="${ideKey}"`,
					].join('\n')
				);
			}
			/* The extension needs to mount the current
			 * working directory in order to sync with
			 * the debugger.
			 * This is currently the base step but
			 * we may mount any path – cwd or not cwd.
			 * We may also mount multiple paths in different locations,
			 * or we may not mount any paths at all and just write a
			 * bunch of PHP files into /wordpress, e.g.
			 * when executing a Blueprint.
			 */
			phpRuntime.FS.mkdirTree(process.cwd());
			phpRuntime.FS.mount(
				phpRuntime.FS.filesystems['NODEFS'],
				{ root: process.cwd() },
				process.cwd()
			);
			phpRuntime.FS.chdir(process.cwd());
		},
	};
}
