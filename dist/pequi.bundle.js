// @ts-self-types="./pequi.bundle.d.ts"
//#region src/destination.ts
const encoder$1 = new TextEncoder();
/** Create a stdout destination descriptor. */
function stdoutDestination() {
	return { type: "stdout" };
}
/** Create a stderr destination descriptor. */
function stderrDestination() {
	return { type: "stderr" };
}
/**
* Create a file destination descriptor.
*
* @param path Filesystem path to write to.
* @param options Set `append: false` to truncate instead of append.
*/
function fileDestination(path, options = {}) {
	return {
		type: "file",
		path,
		append: options.append
	};
}
/**
* Create an in-memory destination descriptor.
*
* @param lines Array that receives each encoded line; defaults to a new array.
*/
function memoryDestination(lines = []) {
	return {
		type: "memory",
		lines
	};
}
/** Create a discard destination descriptor (writes go nowhere). */
function discardDestination() {
	return { type: "discard" };
}
/**
* Type guard for a {@linkcode WritableDestination} (an object with a `write` method).
*
* @param value Candidate value.
*/
function isWritableDestination(value) {
	return typeof value === "object" && value !== null && typeof value.write === "function";
}
/**
* Type guard for a {@linkcode ConfiguredDestination} (an object with a string `type`).
*
* @param value Candidate value.
*/
function isConfiguredDestination(value) {
	return typeof value === "object" && value !== null && typeof value.type === "string";
}
/**
* Resolve a Pino-style destination argument into a {@linkcode WritableDestination}.
*
* Accepts `undefined`/`1`/`"stdout"` (stdout), `2`/`"stderr"` (stderr), a string path (file), a
* custom writable, or a destination descriptor. Numeric file descriptors other than 1/2 throw.
*
* @param target The destination argument.
* @returns A writable destination.
*/
function destination(target) {
	if (target === void 0 || target === 1 || target === "stdout") return createDestinationSink(stdoutDestination());
	if (target === 2 || target === "stderr") return createDestinationSink(stderrDestination());
	if (typeof target === "string") return createDestinationSink(fileDestination(target));
	if (typeof target === "number") throw new TypeError(`Unsupported destination fd: ${target}`);
	if (isWritableDestination(target)) return target;
	return createDestinationSink(target);
}
/**
* Build the concrete {@linkcode DestinationSink} for a destination.
*
* @param target A destination descriptor or custom writable; defaults to stdout.
* @returns The matching sink implementation.
*/
function createDestinationSink(target = stdoutDestination()) {
	if (isWritableDestination(target)) return new WritableSink(target);
	switch (target.type) {
		case "stdout": return new StdoutSink();
		case "stderr": return new StderrSink();
		case "file": return new FileSink(target);
		case "memory": return new MemorySink(target);
		case "discard": return new DiscardSink();
	}
}
var WritableSink = class {
	#destination;
	constructor(destination) {
		this.#destination = destination;
	}
	write(chunk, level) {
		if (level !== void 0) this.#destination.lastLevel = level;
		this.#destination.write(chunk);
	}
	flush() {
		return this.#destination.flush?.();
	}
	close() {
		return this.#destination.end?.();
	}
};
var StdoutSink = class {
	write(chunk) {
		Deno.stdout.writeSync(encoder$1.encode(chunk));
	}
	flush() {}
	end() {}
	close() {}
};
var StderrSink = class {
	write(chunk) {
		Deno.stderr.writeSync(encoder$1.encode(chunk));
	}
	flush() {}
	end() {}
	close() {}
};
var FileSink = class {
	#file;
	constructor(target) {
		this.#file = Deno.openSync(target.path, {
			write: true,
			create: true,
			append: target.append ?? true,
			truncate: target.append === false
		});
	}
	write(chunk) {
		this.#file.writeSync(encoder$1.encode(chunk));
	}
	flush() {
		this.#file.syncSync();
	}
	end() {
		this.close();
	}
	close() {
		this.#file.close();
	}
};
var MemorySink = class {
	#destination;
	constructor(destination) {
		this.#destination = destination;
	}
	write(chunk) {
		this.#destination.lines.push(chunk);
	}
	flush() {}
	end() {}
	close() {}
};
var DiscardSink = class {
	write(_chunk) {}
	flush() {}
	end() {}
	close() {}
};

//#endregion
//#region src/backends/pure.ts
/**
* The pure TypeScript backend.
*
* The default {@linkcode Backend}: it appends the line ending and writes through a
* {@linkcode DestinationSink}. Available directly as the `@pequi/log/pure` export.
*
* @module
*/
/** A {@linkcode Backend} that writes encoded lines to a destination sink in pure TypeScript. */
var PureBackend = class {
	#sink;
	#lineEnding;
	constructor(options = {}) {
		this.#sink = createDestinationSink(options.destination);
		this.#lineEnding = options.lineEnding ?? "\n";
	}
	write(line, level) {
		this.#sink.write(`${line}${this.#lineEnding}`, level);
	}
	flush() {
		this.#sink.flush();
	}
	close() {
		this.#sink.close();
	}
};
/**
* Construct a {@linkcode PureBackend}.
*
* @param options Destination and line-ending options.
* @returns A new pure backend.
*/
function createPureBackend(options = {}) {
	return new PureBackend(options);
}

//#endregion
//#region src/errors.ts
/**
* Error types thrown by Pequi.
*
* {@linkcode PequiError} is the base class for every Pequi-specific error, so callers can catch all
* of them with a single `instanceof` check. Native-backend failures use the
* {@linkcode PequiNativeError} subtree.
*
* @module
*/
/** Base class for all Pequi-specific errors. */
var PequiError = class extends Error {
	/** @param message Human-readable error description. */
	constructor(message) {
		super(message);
		this.name = "PequiError";
	}
};
/** Raised when the Rust native backend fails during initialization, write, flush, or close. */
var PequiNativeError = class extends PequiError {
	statusCode;
	operation;
	destinationKind;
	diagnostics;
	/**
	* @param message Human-readable error description.
	* @param options Optional native context ({@linkcode PequiNativeErrorOptions}).
	*/
	constructor(message, options = {}) {
		super(message);
		this.name = "PequiNativeError";
		this.statusCode = options.statusCode;
		this.operation = options.operation;
		this.destinationKind = options.destinationKind;
		this.diagnostics = options.diagnostics;
		if (options?.cause !== void 0) this.cause = options.cause;
	}
};
/**
* Raised in `native: "required"` mode when the native library cannot be loaded or initialized. In
* `native: "auto"` mode this condition is captured in diagnostics and Pequi falls back to pure
* TypeScript instead of throwing.
*/
var NativeBackendUnavailable = class extends PequiNativeError {
	constructor(message, options) {
		super(message, options);
		this.name = "NativeBackendUnavailable";
	}
};
/** Raised when a destination cannot be turned into a usable sink. */
var UnsupportedDestinationError = class extends PequiError {
	constructor(message) {
		super(message);
		this.name = "UnsupportedDestinationError";
	}
};
/** Raised when an unknown level name is used. */
var InvalidLogLevelError = class extends PequiError {
	/** @param level The offending level name. */
	constructor(level) {
		super(`Invalid log level: ${level}`);
		this.name = "InvalidLogLevelError";
	}
};

//#endregion
//#region src/backends/native.ts
/**
* The optional Rust native backend.
*
* Loads the prebuilt Rust `cdylib` through Deno FFI and exposes a {@linkcode Backend} whose
* write/flush path is handled in Rust. The TypeScript layer still owns all formatting, so this
* module only accepts already-encoded lines. Loading is lazy and platform-gated; in `native:
* "auto"` a load failure falls back to pure TypeScript. Available directly as the
* `@pequi/log/native` export.
*
* @module
*/
/** The native ABI version this build requires; checked against `pequi_abi_version()`. */
const NATIVE_ABI_VERSION = 1;
const supportedTargets = {
	"linux-x86_64": "linux-x86_64-gnu",
	"linux-aarch64": "linux-aarch64-gnu"
};
const rustTargetTriples = {
	"linux-x86_64": "x86_64-unknown-linux-gnu",
	"linux-aarch64": "aarch64-unknown-linux-gnu"
};
/** The C ABI symbol table passed to `Deno.dlopen` (ABI {@linkcode NATIVE_ABI_VERSION}). */
const nativeSymbols = {
	pequi_abi_version: {
		parameters: [],
		result: "u32"
	},
	pequi_init: {
		parameters: [
			"u8",
			"buffer",
			"usize",
			"usize"
		],
		result: "pointer"
	},
	pequi_write: {
		parameters: [
			"pointer",
			"buffer",
			"usize"
		],
		result: "i32"
	},
	pequi_flush: {
		parameters: ["pointer"],
		result: "i32"
	},
	pequi_last_error: {
		parameters: [
			"pointer",
			"buffer",
			"usize"
		],
		result: "usize"
	},
	pequi_last_error_global: {
		parameters: ["buffer", "usize"],
		result: "usize"
	},
	pequi_drop: {
		parameters: ["pointer"],
		result: "void"
	}
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const emptyBuffer = /* @__PURE__ */ new Uint8Array(0);
/** Resolve the Pequi target name for the current platform, or `undefined` if unsupported. */
function resolveNativeTarget() {
	if (Deno.build.os !== "linux") return;
	return supportedTargets[`${Deno.build.os}-${Deno.build.arch}`];
}
/** Resolve the prebuilt library path for the current platform, or `undefined` if unsupported. */
function resolveNativeLibraryPath() {
	const target = resolveNativeTarget();
	if (target === void 0) return;
	return urlPath(new URL(`../../prebuilt/${target}/libpequi_log.so`, import.meta.url));
}
/**
* List candidate library paths in load order: an explicit override, else the prebuilt path followed
* by local Rust `target/release` build outputs.
*
* @param libraryPath Optional explicit path; when given, it is the only candidate.
* @returns De-duplicated candidate paths.
*/
function resolveNativeLibraryCandidates(libraryPath) {
	if (libraryPath !== void 0) return [libraryPath];
	const prebuiltPath = resolveNativeLibraryPath();
	if (prebuiltPath === void 0) return [];
	const candidates = [prebuiltPath, urlPath(new URL("../../native/rust/target/release/libpequi_log.so", import.meta.url))];
	const rustTriple = resolveRustTargetTriple();
	if (rustTriple !== void 0) candidates.push(urlPath(new URL(`../../native/rust/target/${rustTriple}/release/libpequi_log.so`, import.meta.url)));
	return [...new Set(candidates)];
}
/**
* Collect platform and candidate-path information without attempting to load.
*
* @param libraryPath Optional explicit library path.
* @returns The {@linkcode NativeLoadInfo} for the current platform.
*/
function getNativeLoadInfo(libraryPath) {
	return {
		os: Deno.build.os,
		arch: Deno.build.arch,
		target: resolveNativeTarget(),
		attemptedLibraryPaths: resolveNativeLibraryCandidates(libraryPath)
	};
}
/**
* Open the native library, trying each candidate path and validating the ABI version.
*
* @param libraryPath Optional explicit library path.
* @param requestedMode The native mode, used for error context.
* @returns The loaded library and its load info.
* @throws {NativeBackendUnavailable} If no candidate loads with a matching ABI.
*/
function loadNativeLibrary(libraryPath, requestedMode = "required") {
	const loadInfo = getNativeLoadInfo(libraryPath);
	const failures = [];
	let lastCause;
	let dlopenFailed = false;
	let abiVersionFound;
	if (loadInfo.attemptedLibraryPaths.length === 0) throw nativeStartupError(`No native backend target is available for ${Deno.build.os}/${Deno.build.arch}.`, loadInfo, requestedMode);
	for (const attemptedPath of loadInfo.attemptedLibraryPaths) {
		let library;
		try {
			library = Deno.dlopen(attemptedPath, nativeSymbols);
		} catch (cause) {
			dlopenFailed = true;
			lastCause = cause instanceof Error ? cause : void 0;
			failures.push(`${attemptedPath}: ${errorMessage$1(cause)}`);
			continue;
		}
		let abiVersion;
		try {
			abiVersion = Number(library.symbols.pequi_abi_version());
			abiVersionFound = abiVersion;
		} catch (cause) {
			library.close();
			lastCause = cause instanceof Error ? cause : void 0;
			failures.push(`${attemptedPath}: failed to read ABI version: ${errorMessage$1(cause)}`);
			continue;
		}
		if (abiVersion !== 1) {
			library.close();
			failures.push(`${attemptedPath}: native ABI version mismatch: expected ${1}, got ${abiVersion}`);
			continue;
		}
		return {
			...loadInfo,
			library,
			libraryPath: attemptedPath,
			abiVersion
		};
	}
	throw nativeStartupError(`Unable to load native backend.\nFailures:\n${failures.join("\n")}`, loadInfo, requestedMode, lastCause, {
		abiVersionFound,
		dlopenFailed,
		nativeErrorMessage: failures.join("\n")
	});
}
/**
* Create a native backend and return it with {@linkcode NativeDiagnostics}.
*
* @param options Native backend options.
* @returns The backend and diagnostics.
* @throws {NativeBackendUnavailable} If the library cannot be loaded or initialized.
*/
function createNativeBackendResult(options = {}) {
	const requestedMode = options.mode ?? "required";
	const loadInfo = getNativeLoadInfo(options.libraryPath);
	const destination = resolveNativeDestination(options.destination, loadInfo, requestedMode);
	const bufferSize = normalizeBufferSize(options.bufferSize, loadInfo, requestedMode, destination.kind);
	const loaded = loadNativeLibrary(options.libraryPath, requestedMode);
	let handle;
	try {
		handle = loaded.library.symbols.pequi_init(destination.kind, destination.pathBytes, BigInt(destination.pathBytes.byteLength), BigInt(bufferSize));
	} catch (cause) {
		loaded.library.close();
		throw nativeStartupError(`Native backend initialization failed before returning a handle: ${errorMessage$1(cause)}`, loaded, requestedMode, cause instanceof Error ? cause : void 0, {
			abiVersionFound: loaded.abiVersion,
			initFailed: true,
			nativeErrorMessage: errorMessage$1(cause)
		});
	}
	if (handle === null) {
		const nativeError = readGlobalLastError(loaded.library);
		loaded.library.close();
		throw nativeStartupError(`Native backend initialization failed: ${nativeError}`, loaded, requestedMode, void 0, {
			abiVersionFound: loaded.abiVersion,
			initFailed: true,
			nativeErrorMessage: nativeError
		});
	}
	const diagnostics = createNativeDiagnostics(loaded, requestedMode, {
		selectedBackend: "native",
		abiVersionFound: loaded.abiVersion
	});
	return {
		backend: new NativeBackend(loaded.library, handle, options.lineEnding ?? "\n", destination.kind, loaded.libraryPath, diagnostics),
		diagnostics
	};
}
function resolveNativeDestination(destination, loadInfo, requestedMode) {
	if (destination === void 0) return {
		kind: 1,
		pathBytes: emptyBuffer
	};
	if (!isConfiguredDestination(destination)) throw nativeStartupError("The native backend supports configured destinations only; custom writable destinations use the pure TypeScript backend.", loadInfo, requestedMode, void 0, { nativeErrorMessage: "custom writable destination is not supported by native" });
	switch (destination.type) {
		case "discard": return {
			kind: 0,
			pathBytes: emptyBuffer
		};
		case "stdout": return {
			kind: 1,
			pathBytes: emptyBuffer
		};
		case "stderr": return {
			kind: 2,
			pathBytes: emptyBuffer
		};
		case "file": return {
			kind: 3,
			pathBytes: encoder.encode(destination.path)
		};
		case "memory": throw nativeStartupError("The native backend does not support the memory destination; use native: false or native: auto fallback for memory capture.", loadInfo, requestedMode, void 0, { nativeErrorMessage: "memory destination is not supported by native" });
	}
}
const DEFAULT_FILE_BUFFER_SIZE = 65536;
const FILE_DESTINATION_KIND = 3;
function normalizeBufferSize(bufferSize, loadInfo, requestedMode, destinationKind) {
	if (bufferSize === void 0) return destinationKind === FILE_DESTINATION_KIND ? DEFAULT_FILE_BUFFER_SIZE : 0;
	if (!Number.isSafeInteger(bufferSize) || bufferSize < 0) throw nativeStartupError(`Invalid native buffer size: ${bufferSize}. Expected a non-negative safe integer.`, loadInfo, requestedMode, void 0, { nativeErrorMessage: "invalid native buffer size" });
	return bufferSize;
}
/**
* A {@linkcode Backend} backed by the Rust native sink over FFI.
*
* Encodes each line to UTF-8 and forwards it to `pequi_write`; {@linkcode NativeBackend.flush} and
* {@linkcode NativeBackend.close} map to `pequi_flush` and `pequi_drop`. After close, further
* writes throw {@linkcode PequiNativeError}. Construct it through {@linkcode createNativeBackend}
* rather than directly.
*/
var NativeBackend = class {
	#library;
	#handle;
	#lineEnding;
	#destinationKind;
	#libraryPath;
	#diagnostics;
	#closed = false;
	constructor(library, handle, lineEnding, destinationKind, libraryPath, diagnostics) {
		this.#library = library;
		this.#handle = handle;
		this.#lineEnding = lineEnding;
		this.#destinationKind = destinationKind;
		this.#libraryPath = libraryPath;
		this.#diagnostics = diagnostics;
	}
	get diagnostics() {
		return this.#diagnostics;
	}
	get destinationKind() {
		return this.#destinationKind;
	}
	write(line) {
		this.#assertOpen("write");
		const bytes = encoder.encode(`${line}${this.#lineEnding}`);
		const code = this.#library.symbols.pequi_write(this.#handle, bytes, BigInt(bytes.byteLength));
		this.#assertNativeOk(code, "write");
	}
	flush() {
		this.#assertOpen("flush");
		const code = this.#library.symbols.pequi_flush(this.#handle);
		this.#assertNativeOk(code, "flush");
	}
	close() {
		if (this.#closed) return;
		this.#closed = true;
		try {
			this.#library.symbols.pequi_drop(this.#handle);
		} finally {
			this.#library.close();
		}
	}
	#assertOpen(operation) {
		if (this.#closed) throw new PequiNativeError(`Native backend ${operation} failed: native backend is already closed.`, {
			operation,
			destinationKind: this.#destinationKind,
			diagnostics: this.#diagnostics
		});
	}
	#assertNativeOk(code, operation) {
		if (code === 0) return;
		const lastError = this.#lastErrorMessage();
		throw new PequiNativeError([
			`Native backend ${operation} failed with status ${code} (${nativeStatusName(code)}).`,
			`native last error: ${lastError}`,
			`destination kind: ${this.#destinationKind}`,
			`operating system: ${this.#diagnostics.os}`,
			`architecture: ${this.#diagnostics.arch}`,
			`attempted library path: ${this.#libraryPath}`
		].join("\n"), {
			statusCode: code,
			operation,
			destinationKind: this.#destinationKind,
			diagnostics: {
				...this.#diagnostics,
				nativeErrorMessage: lastError
			}
		});
	}
	#lastErrorMessage() {
		return readHandleLastError(this.#library, this.#handle);
	}
};
function readHandleLastError(library, handle) {
	const length = Number(library.symbols.pequi_last_error(handle, emptyBuffer, 0n));
	if (length <= 0) return "unknown native error";
	const buffer = new Uint8Array(length);
	const reportedLength = Number(library.symbols.pequi_last_error(handle, buffer, BigInt(buffer.byteLength)));
	return decoder.decode(buffer.subarray(0, Math.min(reportedLength || length, buffer.byteLength)));
}
function readGlobalLastError(library) {
	const length = Number(library.symbols.pequi_last_error_global(emptyBuffer, 0n));
	if (length <= 0) return "unknown native initialization error";
	const buffer = new Uint8Array(length);
	const reportedLength = Number(library.symbols.pequi_last_error_global(buffer, BigInt(buffer.byteLength)));
	return decoder.decode(buffer.subarray(0, Math.min(reportedLength || length, buffer.byteLength)));
}
function resolveRustTargetTriple() {
	if (Deno.build.os !== "linux") return;
	return rustTargetTriples[`${Deno.build.os}-${Deno.build.arch}`];
}
function nativeStartupError(message, loadInfo, requestedMode, cause, overrides = {}) {
	const attemptedLibraryPath = loadInfo.attemptedLibraryPaths.length === 0 ? "none" : loadInfo.attemptedLibraryPaths.join(", ");
	const diagnostics = createNativeDiagnostics(loadInfo, requestedMode, {
		selectedBackend: "native",
		...overrides
	});
	return new NativeBackendUnavailable([
		message,
		`operating system: ${loadInfo.os}`,
		`architecture: ${loadInfo.arch}`,
		`attempted library path: ${attemptedLibraryPath}`,
		"--allow-ffi may be missing: Deno FFI requires --allow-ffi to load native libraries."
	].join("\n"), {
		cause,
		diagnostics
	});
}
function createNativeDiagnostics(loadInfo, requestedMode, overrides = {}) {
	return {
		requestedMode,
		selectedBackend: overrides.selectedBackend ?? "native",
		fallbackReason: overrides.fallbackReason,
		os: loadInfo.os,
		arch: loadInfo.arch,
		attemptedLibraryPaths: loadInfo.attemptedLibraryPaths,
		abiVersionFound: overrides.abiVersionFound,
		abiVersionExpected: 1,
		dlopenFailed: overrides.dlopenFailed ?? false,
		initFailed: overrides.initFailed ?? false,
		nativeErrorMessage: overrides.nativeErrorMessage
	};
}
function nativeStatusName(code) {
	switch (code) {
		case 1: return "null handle";
		case 2: return "null bytes pointer";
		case 3: return "invalid UTF-8";
		case 4: return "I/O error";
		case 5: return "panic caught";
		case 6: return "invalid destination";
		case 7: return "invalid path";
		case 255: return "unknown error";
		default: return "unrecognized error";
	}
}
function errorMessage$1(error) {
	return error instanceof Error ? error.message : String(error);
}
function urlPath(url) {
	return url.pathname;
}

//#endregion
//#region src/backend.ts
/**
* Backend selection.
*
* Chooses between the pure TypeScript backend and the optional Rust native backend based on the
* {@linkcode NativeMode}. {@linkcode resolveBackend} returns the chosen backend plus
* {@linkcode NativeDiagnostics} (so callers can confirm native loaded), while
* {@linkcode createBackend} returns just the backend for normal use.
*
* @module
*/
/**
* Create a backend, discarding diagnostics. This is the normal entrypoint.
*
* @param options Backend selection and construction options.
* @returns The selected backend.
*/
function createBackend(options = {}) {
	return resolveBackend(options).backend;
}
/**
* Resolve a backend and return it together with native diagnostics.
*
* In `native: "auto"`, a native load failure is captured in diagnostics and the pure backend is
* returned; in `native: "required"`, the failure is rethrown.
*
* @param options Backend selection and construction options.
* @returns The backend and its resolution diagnostics.
*/
function resolveBackend(options = {}) {
	const requestedMode = options.native ?? false;
	if (requestedMode === false) return createPureResolution(options, requestedMode);
	try {
		return createNativeBackendResult({
			mode: requestedMode,
			destination: options.destination,
			lineEnding: options.lineEnding,
			bufferSize: options.nativeBufferSize,
			libraryPath: options.nativeLibraryPath
		});
	} catch (error) {
		if (requestedMode === "required") throw error;
		return createPureResolution(options, requestedMode, error);
	}
}
function createPureResolution(options, requestedMode, fallbackError) {
	const loadInfo = getNativeLoadInfo(options.nativeLibraryPath);
	const fallbackDiagnostics = extractDiagnostics(fallbackError);
	const fallbackReason = fallbackError === void 0 ? void 0 : errorMessage(fallbackError);
	return {
		backend: createPureBackend({
			destination: options.destination,
			lineEnding: options.lineEnding
		}),
		diagnostics: {
			requestedMode,
			selectedBackend: "pure",
			fallbackReason,
			os: loadInfo.os,
			arch: loadInfo.arch,
			attemptedLibraryPaths: loadInfo.attemptedLibraryPaths,
			abiVersionFound: fallbackDiagnostics?.abiVersionFound,
			abiVersionExpected: 1,
			dlopenFailed: fallbackDiagnostics?.dlopenFailed ?? false,
			initFailed: fallbackDiagnostics?.initFailed ?? false,
			nativeErrorMessage: fallbackDiagnostics?.nativeErrorMessage
		}
	};
}
function extractDiagnostics(error) {
	const diagnostics = error?.diagnostics;
	return isNativeDiagnostics(diagnostics) ? diagnostics : void 0;
}
function isNativeDiagnostics(value) {
	return typeof value === "object" && value !== null && typeof value.selectedBackend === "string" && typeof value.abiVersionExpected === "number";
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

//#endregion
//#region src/bindings.ts
/**
* Build the base bindings for a root logger from its `base` and `name` options.
*
* @param options Name and base configuration.
* @returns A new bindings object.
*/
function createBaseBindings(options = {}) {
	const bindings = {};
	if (options.base !== false && options.base !== null && options.base !== void 0) Object.assign(bindings, options.base);
	if (options.name !== void 0) bindings.name = options.name;
	return bindings;
}
/**
* Merge parent bindings with child bindings; child keys win on conflict.
*
* @param parent The parent logger's bindings.
* @param child The child logger's additional bindings.
* @returns A new merged bindings object.
*/
function mergeBindings(parent, child) {
	return {
		...parent,
		...child
	};
}
/**
* Return a shallow copy of a bindings object, so callers cannot mutate a logger's internal state.
*
* @param bindings The bindings to copy.
* @returns A new object with the same keys and values.
*/
function copyBindings(bindings) {
	return { ...bindings };
}

//#endregion
//#region src/encode.ts
const CIRCULAR = "\"[Circular]\"";
/**
* JSON encoder that mirrors `JSON.stringify` output while surviving the inputs that make it throw.
*
* It preserves insertion order at every level to match Pino's line output, replaces circular
* references with `"[Circular]"`, and renders `BigInt` as a numeric literal. `toJSON`, `undefined`,
* function, and symbol values, plus non-finite numbers, follow `JSON.stringify` semantics. Optional
* depth/edge limits reproduce the truncation tokens of `safe-stable-stringify`, the library Pino
* wraps.
*/
function safeStableStringify(value, options = {}) {
	return encodeValue(value, "", [], 1, options.depthLimit ?? Infinity, options.edgeLimit ?? Infinity) ?? "null";
}
function encodeValue(value, key, ancestors, depth, depthLimit, edgeLimit) {
	if (value !== null && typeof value === "object" && typeof value.toJSON === "function") value = value.toJSON(key);
	switch (typeof value) {
		case "string": return quote(value);
		case "number": return Number.isFinite(value) ? String(value) : "null";
		case "boolean": return value ? "true" : "false";
		case "bigint": return value.toString();
		case "object": break;
		default: return;
	}
	if (value === null) return "null";
	if (ancestors.includes(value)) return CIRCULAR;
	if (depth > depthLimit) return Array.isArray(value) ? "\"[Array]\"" : "\"[Object]\"";
	ancestors.push(value);
	const result = Array.isArray(value) ? encodeArray(value, ancestors, depth, depthLimit, edgeLimit) : encodeObject(value, ancestors, depth, depthLimit, edgeLimit);
	ancestors.pop();
	return result;
}
function encodeObject(object, ancestors, depth, depthLimit, edgeLimit) {
	const keys = Object.keys(object);
	const parts = [];
	let rendered = 0;
	for (const key of keys) {
		if (rendered >= edgeLimit) {
			parts.push(`"...":${quote(truncationMessage(keys.length - rendered, false))}`);
			break;
		}
		const encoded = encodeValue(object[key], key, ancestors, depth + 1, depthLimit, edgeLimit);
		if (encoded === void 0) continue;
		parts.push(`${quote(key)}:${encoded}`);
		rendered++;
	}
	return `{${parts.join(",")}}`;
}
function encodeArray(array, ancestors, depth, depthLimit, edgeLimit) {
	const parts = [];
	for (let index = 0; index < array.length; index++) {
		if (index >= edgeLimit) {
			const remaining = Math.max(array.length - edgeLimit - 1, 0);
			parts.push(quote(truncationMessage(remaining, true)));
			break;
		}
		const encoded = encodeValue(array[index], String(index), ancestors, depth + 1, depthLimit, edgeLimit);
		parts.push(encoded ?? "null");
	}
	return `[${parts.join(",")}]`;
}
function truncationMessage(remaining, isArray) {
	const body = `${remaining} ${remaining === 1 ? "item" : "items"} not stringified`;
	return isArray ? `... ${body}` : body;
}
/** Delegate string escaping to the engine so it is byte-identical to `JSON.stringify`. */
function quote(value) {
	return JSON.stringify(value);
}

//#endregion
//#region src/serializers.ts
/**
* Type guard for `Error` instances.
*
* @param value Candidate value.
* @returns Whether `value` is an `Error`.
*/
function isError(value) {
	return value instanceof Error;
}
/**
* Serialize an Error (and its `cause` chain) into a plain {@linkcode SerializedError} object.
*
* @param error The error to serialize.
* @returns A JSON-safe representation including own enumerable properties.
*/
function serializeError(error) {
	const serialized = {
		type: error.name || "Error",
		message: error.message
	};
	if (error.stack !== void 0) serialized.stack = error.stack;
	if ("cause" in error && error.cause !== void 0) serialized.cause = isError(error.cause) ? serializeError(error.cause) : error.cause;
	for (const key of Object.keys(error)) serialized[key] = error[key];
	return serialized;
}
/**
* The standard `err` serializer: serialize Errors, pass other values through unchanged.
*
* @param value The value bound to an `err`/error key.
* @returns A {@linkcode SerializedError} for Errors, otherwise `value`.
*/
function errSerializer(value) {
	return isError(value) ? serializeError(value) : value;
}
/**
* Like {@linkcode errSerializer}; `serializeError` already follows the `cause` chain, so this is
* the `errWithCause` alias for Pino compatibility.
*
* @param value The value bound to an error key.
* @returns A {@linkcode SerializedError} for Errors, otherwise `value`.
*/
function errWithCauseSerializer(value) {
	return isError(value) ? serializeError(value) : value;
}
/** The built-in serializers exposed as `pequi.stdSerializers`. */
const stdSerializers = {
	err: errSerializer,
	errWithCause: errWithCauseSerializer
};
/**
* Serialize any Error values nested inside a log record, copy-on-write.
*
* Returns the original record untouched when nothing needs serializing (the common case); otherwise
* returns a copy with Errors replaced, leaving the caller's objects unmutated.
*
* @param record The log record to scan.
* @returns The record, or a copy with nested Errors serialized.
*/
function serializeErrorValues(record) {
	if (!hasComplexValue(record)) return record;
	const seen = /* @__PURE__ */ new WeakMap();
	let copy = null;
	for (const key in record) {
		const value = record[key];
		const serialized = serializeValue(value, seen);
		if (serialized !== value) {
			if (copy === null) copy = { ...record };
			copy[key] = serialized;
		}
	}
	return copy ?? record;
}
function hasComplexValue(record) {
	for (const key in record) {
		const value = record[key];
		if (typeof value === "object" && value !== null) return true;
	}
	return false;
}
function serializeValue(value, seen) {
	if (isError(value)) return serializeError(value);
	if (typeof value !== "object" || value === null) return value;
	const existing = seen.get(value);
	if (existing !== void 0) return existing;
	if (Array.isArray(value)) {
		seen.set(value, value);
		let copy = null;
		for (let index = 0; index < value.length; index++) {
			const item = value[index];
			const serialized = serializeValue(item, seen);
			if (serialized !== item) {
				if (copy === null) {
					copy = value.slice();
					seen.set(value, copy);
				}
				copy[index] = serialized;
			}
		}
		return copy ?? value;
	}
	if (!isPlainObject(value)) return value;
	seen.set(value, value);
	let copy = null;
	const source = value;
	for (const key in source) {
		const nested = source[key];
		const serialized = serializeValue(nested, seen);
		if (serialized !== nested) {
			if (copy === null) {
				copy = { ...source };
				seen.set(value, copy);
			}
			copy[key] = serialized;
		}
	}
	return copy ?? value;
}
function isPlainObject(value) {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
/**
* Apply user {@linkcode Serializers} to matching top-level keys of a record, copy-on-write.
*
* @param record The log record.
* @param serializers The configured serializers, or `undefined` for none.
* @returns The record, or a copy with matching keys transformed.
*/
function applySerializers(record, serializers) {
	if (serializers === void 0) return record;
	let next = record;
	for (const key in serializers) if (Object.hasOwn(record, key)) {
		if (next === record) next = { ...record };
		next[key] = serializers[key](next[key]);
	}
	return next;
}

//#endregion
//#region src/format.ts
/**
* Argument normalization, printf-style message formatting, and JSON-line encoding.
*
* {@linkcode normalizeLogArguments} turns Pino-style call arguments into a log record,
* {@linkcode formatMessage} implements the `quick-format-unescaped` placeholder rules, and
* {@linkcode formatJsonLine} encodes a record to a single JSON line (with a safe fallback).
*
* @module
*/
/**
* Normalize a level method's arguments into a log record, matching Pino's call shapes (merge
* object, Error, and/or printf-style message with arguments).
*
* @param objOrMsg The first argument: a merge object, an Error, or a message string.
* @param msg An optional message string when the first argument is an object/Error.
* @param args Remaining printf-style format arguments.
* @param options Field-name and prefix configuration.
* @returns The assembled log record (before bindings, level, and time are added).
*/
function normalizeLogArguments(objOrMsg, msg, args, options = {
	errorKey: "err",
	messageKey: "msg",
	msgPrefix: ""
}) {
	if (objOrMsg === void 0) return msg === void 0 ? {} : withMessage(formatMessage(msg, args), options);
	if (objOrMsg === null) return msg === void 0 ? withMessage(null, options) : withMessage(formatMessage(msg, args), options);
	if (isError(objOrMsg)) {
		const record = options.nestedKey === void 0 ? { [options.errorKey]: objOrMsg } : { [options.nestedKey]: { [options.errorKey]: objOrMsg } };
		record[options.messageKey] = options.msgPrefix + (msg === void 0 ? objOrMsg.message : formatMessage(msg, args));
		return record;
	}
	if (isLogObject(objOrMsg)) {
		const record = applyNestedKey({ ...objOrMsg }, options.nestedKey);
		if (msg !== void 0) record[options.messageKey] = options.msgPrefix + formatMessage(msg, args);
		return record;
	}
	const messageArgs = msg === void 0 ? args : [msg, ...args];
	return withMessage(formatMessage(String(objOrMsg), messageArgs), options);
}
/**
* Mirrors Pino's `quick-format-unescaped` rather than Node's `util.format`: `%i` floors,
* `%d`/`%f` coerce with `Number`, `%j`/`%o`/`%O` JSON-encode (circular-safe), `%c` and unknown
* tokens stay literal, and leftover arguments are dropped instead of appended.
*
* @param template The message template, possibly containing `%` placeholders.
* @param args Values substituted into the placeholders, in order.
* @returns The formatted message string.
*/
function formatMessage(template, args) {
	if (args.length === 0) return template;
	let pct = template.indexOf("%");
	if (pct === -1) return template;
	const limit = template.length - 1;
	let result = "";
	let argIndex = 0;
	let last = 0;
	while (pct !== -1 && pct < limit) {
		const token = template[pct + 1];
		if (token === "%") {
			result += template.slice(last, pct) + "%";
			last = pct + 2;
		} else if (argIndex < args.length && isFormatToken(token)) {
			result += template.slice(last, pct) + formatToken(token, args[argIndex]);
			argIndex++;
			last = pct + 2;
		} else {
			pct = template.indexOf("%", pct + 1);
			continue;
		}
		pct = template.indexOf("%", last);
	}
	return last === 0 ? template : result + template.slice(last);
}
function isFormatToken(token) {
	return token === "s" || token === "d" || token === "i" || token === "f" || token === "j" || token === "o" || token === "O";
}
function formatToken(token, value) {
	switch (token) {
		case "s": return String(value);
		case "d":
		case "f": return Number(value).toString();
		case "i": return Math.floor(Number(value)).toString();
		default: return safeStableStringify(value);
	}
}
/**
* Encode a log record as a single JSON line.
*
* Uses native `JSON.stringify` on the fast path and falls back to {@linkcode safeStableStringify}
* when it throws (circular references, `BigInt`) or when depth/edge limits are requested.
*
* @param record The fully assembled log record.
* @param options Optional depth/edge truncation limits.
* @returns The encoded JSON line (without a trailing newline).
*/
function formatJsonLine(record, options = {}) {
	if (options.depthLimit === void 0 && options.edgeLimit === void 0) try {
		return JSON.stringify(record);
	} catch {
		return safeStableStringify(record);
	}
	return safeStableStringify(record, options);
}
function withMessage(message, options) {
	return { [options.messageKey]: typeof message === "string" ? options.msgPrefix + message : message };
}
function applyNestedKey(object, nestedKey) {
	if (nestedKey === void 0) return object;
	return { [nestedKey]: object };
}
function isLogObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

//#endregion
//#region src/levels.ts
/** Core level name to numeric value (`trace`=10 … `fatal`=60, `silent`=`Infinity`). */
const levels = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60,
	silent: Infinity
};
/** The six core level names in ascending severity order. */
const CORE_LEVEL_NAMES = [
	"trace",
	"debug",
	"info",
	"warn",
	"error",
	"fatal"
];
const CORE_LEVEL_VALUES = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60
};
/** The default minimum level used when none is configured. */
const DEFAULT_LEVEL = "info";
/** The default {@linkcode Levels} registry exposed as `logger.levels` for the core levels. */
const pinoLevels = {
	labels: {
		10: "trace",
		20: "debug",
		30: "info",
		40: "warn",
		50: "error",
		60: "fatal"
	},
	values: {
		trace: 10,
		debug: 20,
		info: 30,
		warn: 40,
		error: 50,
		fatal: 60
	}
};
const levelNames = new Set(Object.keys(levels));
/**
* Type guard for a known core level name (including `silent`).
*
* @param value Candidate level name.
* @returns Whether `value` is a built-in level.
*/
function isLogLevel(value) {
	return levelNames.has(value);
}
/**
* Resolve a core level name to its numeric value.
*
* @param level A core level name.
* @returns The numeric value.
* @throws {InvalidLogLevelError} If the name is not a core level.
*/
function levelToNumber(level) {
	const value = levels[level];
	if (value === void 0) throw new InvalidLogLevelError(level);
	return value;
}
/**
* Whether `candidateLevel` would emit given a logger set to `currentLevel` (ascending core levels).
*
* @param currentLevel The logger's active threshold.
* @param candidateLevel The level being logged.
*/
function isLevelEnabled(currentLevel, candidateLevel) {
	return levelToNumber(candidateLevel) >= levelToNumber(currentLevel);
}
/** Ascending comparison: a level emits when its value is at least the active threshold. */
function ascCompare(candidate, active) {
	return candidate >= active;
}
/** Descending comparison: a level emits when its value is at most the active threshold. */
function descCompare(candidate, active) {
	return candidate <= active;
}
/**
* Build a per-logger {@linkcode LevelRegistry} from custom levels and a comparison policy.
*
* @param options Custom levels, `useOnlyCustomLevels`, and the comparison policy.
* @returns The resolved registry used for level lookups and hot-path gating.
*/
function buildLevelRegistry(options = {}) {
	const values = {
		...options.useOnlyCustomLevels === true ? {} : { ...CORE_LEVEL_VALUES },
		...options.customLevels
	};
	const labels = {};
	for (const [name, value] of Object.entries(values)) labels[value] = name;
	const compare = typeof options.levelComparison === "function" ? options.levelComparison : options.levelComparison === "DESC" ? descCompare : ascCompare;
	const registry = {
		values,
		labels,
		isAsc: compare === ascCompare,
		has(name) {
			return name === "silent" || Object.hasOwn(values, name);
		},
		valueOf(name) {
			if (name === "silent") return Infinity;
			const value = values[name];
			if (value === void 0) throw new InvalidLogLevelError(name);
			return value;
		},
		isEnabled(activeLevel, candidateLevel) {
			const active = registry.valueOf(activeLevel);
			if (active === Infinity) return false;
			return compare(registry.valueOf(candidateLevel), active);
		}
	};
	return registry;
}
/** Mirrors Pino's construction-time guard for `useOnlyCustomLevels`. */
function assertLevelConfigured(level, registry, useOnlyCustomLevels) {
	if (useOnlyCustomLevels === true && !registry.has(level)) throw new PequiError(`default level:${level} must be included in custom levels`);
}

//#endregion
//#region src/multistream.ts
/**
* Multi-destination fan-out.
*
* {@linkcode multistream} mirrors `pino.multistream`: it routes one logger's output to several
* destinations, each filtered by its own level, with optional `dedupe` to send each line to a
* single stream.
*
* @module
*/
const INFO = levelToNumber("info");
function resolveLevel(level, fallback) {
	if (level === void 0) return fallback;
	return typeof level === "number" ? level : levelToNumber(level);
}
/**
* Fans a single logger's output out to several destinations, each filtered by its own level. Mirrors
* `pino.multistream`: pass the result as the destination, and the logger sets `lastLevel` before each
* write so the lines can be routed.
*/
function multistream(streams, options = {}) {
	const defaultLevel = resolveLevel(options.level, INFO);
	const dedupe = options.dedupe === true;
	const resolved = [];
	const result = {
		lastLevel: defaultLevel,
		streams: resolved,
		add(entry) {
			resolved.push(toResolved(entry, defaultLevel));
			return result;
		},
		write(chunk) {
			const level = result.lastLevel;
			if (dedupe) writeDeduped(resolved, level, chunk);
			else for (const entry of resolved) if (level >= entry.level) entry.stream.write(chunk);
			return true;
		},
		flush() {
			for (const entry of resolved) entry.stream.flush?.();
		},
		end() {
			for (const entry of resolved) entry.stream.end?.();
		}
	};
	for (const entry of Array.isArray(streams) ? streams : [streams]) result.add(entry);
	return result;
}
function toResolved(entry, defaultLevel) {
	if (isWritableDestination(entry)) return {
		level: defaultLevel,
		stream: entry
	};
	return {
		level: resolveLevel(entry.level, defaultLevel),
		stream: entry.stream
	};
}
function writeDeduped(streams, level, chunk) {
	if (streams.length === 0) return;
	let target = -Infinity;
	for (const entry of streams) if (entry.level <= level && entry.level > target) target = entry.level;
	if (target === -Infinity) target = Math.min(...streams.map((entry) => entry.level));
	for (const entry of streams) if (entry.level === target) entry.stream.write(chunk);
}

//#endregion
//#region src/redaction.ts
/** The default replacement value when no censor is configured. */
const DEFAULT_CENSOR = "[Redacted]";
const IMMUTABLE_ROOT_KEYS = /* @__PURE__ */ new Set(["level", "time"]);
/**
* Normalize a {@linkcode RedactConfig} into a {@linkcode NormalizedRedact} with pre-parsed paths.
*
* @param config The redaction config, or `undefined`/`false` to disable.
* @returns The normalized config, or `undefined` when redaction is disabled or has no paths.
*/
function normalizeRedact(config) {
	if (config === void 0 || config === false) return;
	const raw = Array.isArray(config) ? {
		paths: config,
		censor: DEFAULT_CENSOR,
		remove: false
	} : {
		paths: config.paths,
		censor: config.censor ?? "[Redacted]",
		remove: config.remove ?? false
	};
	if (raw.paths.length === 0) return;
	return {
		paths: raw.paths.map(parsePath),
		censor: raw.censor,
		remove: raw.remove
	};
}
/**
* Redacts in place. The caller (`buildRecord`) passes a record that has already been deep-copied by
* the serializer pass, so mutating it here never touches the user's logged objects.
*/
function redactRecord(record, redact) {
	if (redact === void 0) return record;
	let result = record;
	for (const segments of redact.paths) result = redactContainer(result, segments, 0, [], redact);
	return result;
}
/**
* Splits a redaction path into segments, supporting dot paths (`a.b`), array/bracket access
* (`a[0]`, `a[*]`), quoted keys with dots (`a["x.y"]`), and wildcards (`*`, `a.*`, `*.b`).
*/
function parsePath(path) {
	const segments = [];
	let current = "";
	let index = 0;
	const flush = () => {
		if (current.length > 0) {
			segments.push(current);
			current = "";
		}
	};
	while (index < path.length) {
		const char = path[index];
		if (char === ".") {
			flush();
			index++;
		} else if (char === "[") {
			flush();
			index++;
			const quote = path[index];
			if (quote === "\"" || quote === "'") {
				index++;
				let key = "";
				while (index < path.length && path[index] !== quote) {
					key += path[index];
					index++;
				}
				index++;
				while (index < path.length && path[index] !== "]") index++;
				index++;
				segments.push(key);
			} else {
				let inner = "";
				while (index < path.length && path[index] !== "]") {
					inner += path[index];
					index++;
				}
				index++;
				segments.push(inner);
			}
		} else {
			current += char;
			index++;
		}
	}
	flush();
	return segments;
}
/**
* Copy-on-write redaction: returns `target` unchanged, or a shallow copy of each container along the
* matched path with the leaf censored/removed. The caller's logged objects are never mutated, which
* matters now that the serializer pass no longer always hands redaction a private deep copy.
*/
function redactContainer(target, segments, index, trail, redact) {
	if (typeof target !== "object" || target === null) return target;
	const container = target;
	const segment = segments[index];
	const isLast = index === segments.length - 1;
	const keys = segment === "*" ? Object.keys(container) : Object.hasOwn(container, segment) ? [segment] : [];
	if (keys.length === 0) return target;
	let copy = null;
	for (const key of keys) {
		const nextTrail = [...trail, key];
		if (isLast) {
			if (nextTrail.length === 1 && IMMUTABLE_ROOT_KEYS.has(key)) continue;
			if (copy === null) copy = cloneContainer(container);
			if (redact.remove) delete copy[key];
			else copy[key] = typeof redact.censor === "function" ? redact.censor(copy[key], nextTrail) : redact.censor;
		} else {
			const child = container[key];
			const next = redactContainer(child, segments, index + 1, nextTrail, redact);
			if (next !== child) {
				if (copy === null) copy = cloneContainer(container);
				copy[key] = next;
			}
		}
	}
	return copy ?? target;
}
function cloneContainer(container) {
	return Array.isArray(container) ? container.slice() : { ...container };
}

//#endregion
//#region src/logger.ts
/**
* The logger factory and core logging pipeline.
*
* This module assembles everything else: it normalizes options, builds the level registry,
* serializers, redaction, and backend, and produces the {@linkcode Logger}. The {@linkcode pequi}
* factory (aliased as {@linkcode pino}) is the package's main entrypoint, re-exported from
* `@pequi/log`.
*
* @module
*/
/** The Pequi version string, also exposed as `logger.version`. */
const version = "0.8.0";
/** Well-known symbols, mirroring Pino's `pino.symbols`. */
const symbols = {
	serializers: Symbol.for("pino.serializers"),
	serializersSym: Symbol.for("pino.serializers")
};
/** Built-in timestamp functions, mirroring Pino's `pino.stdTimeFunctions`. */
const stdTimeFunctions = {
	epochTime() {
		return `,"time":${Date.now()}`;
	},
	isoTime() {
		return `,"time":"${(/* @__PURE__ */ new Date()).toISOString()}"`;
	}
};
function pequiFactory(optionsOrDestination = {}, maybeDestination) {
	const { options, destination } = normalizeFactoryArguments(optionsOrDestination, maybeDestination);
	const nativeLibraryPath = options.nativeLibraryPath;
	const lineEnding = options.crlf === true ? "\r\n" : "\n";
	const backend = createBackend({
		native: options.native,
		destination,
		lineEnding,
		nativeLibraryPath
	});
	const levelRegistry = buildLevelRegistry({
		customLevels: options.customLevels,
		useOnlyCustomLevels: options.useOnlyCustomLevels,
		levelComparison: options.levelComparison
	});
	const level = options.level ?? "info";
	assertLevelConfigured(level, levelRegistry, options.useOnlyCustomLevels);
	return createLogger({
		backend,
		level,
		levelValue: levelRegistry.valueOf(level),
		levels: levelRegistry,
		customLevels: options.customLevels,
		useOnlyCustomLevels: options.useOnlyCustomLevels,
		levelComparison: options.levelComparison,
		enabled: options.enabled ?? true,
		baseFields: createDefaultBaseFields(options),
		bindings: createBaseBindings({
			name: options.name,
			base: options.base
		}),
		serializers: createSerializers(options.serializers, options.errorKey ?? "err"),
		redact: normalizeRedact(options.redact),
		timestamp: options.timestamp,
		messageKey: options.messageKey ?? "msg",
		errorKey: options.errorKey ?? "err",
		nestedKey: options.nestedKey,
		msgPrefix: options.msgPrefix ?? "",
		formatters: options.formatters ?? {},
		hooks: options.hooks,
		mixin: options.mixin,
		mixinMergeStrategy: options.mixinMergeStrategy,
		lineEnding,
		encode: {
			depthLimit: options.depthLimit,
			edgeLimit: options.edgeLimit
		},
		onChild: options.onChild,
		events: /* @__PURE__ */ new Map()
	});
}
/**
* The Pequi logger factory and the package's default export.
*
* Call it with options and/or a destination to create a {@linkcode Logger}; static helpers are
* attached per {@linkcode PequiFactory}.
*
* @example
* ```ts
* import { pequi } from "@pequi/log";
* const log = pequi({ level: "debug" });
* log.debug("ready");
* ```
*/
const pequi = Object.assign(pequiFactory, {
	destination,
	transport: notImplemented("transport"),
	multistream,
	stdSerializers,
	stdTimeFunctions,
	symbols,
	version,
	levels: pinoLevels
});
/** Drop-in alias of {@linkcode pequi} for Pino-style `import pino from "@pequi/log"` usage. */
const pino = pequi;
function createLogger(state) {
	const logger = {
		trace: createLogMethod(state, "trace", 10),
		debug: createLogMethod(state, "debug", 20),
		info: createLogMethod(state, "info", 30),
		warn: createLogMethod(state, "warn", 40),
		error: createLogMethod(state, "error", 50),
		fatal: createLogMethod(state, "fatal", 60),
		silent: () => {},
		child(bindings, options = {}) {
			const childPrefix = options.msgPrefix === void 0 ? state.msgPrefix : `${state.msgPrefix}${options.msgPrefix}`;
			const childCustomLevels = state.customLevels !== void 0 || options.customLevels !== void 0 ? {
				...state.customLevels,
				...options.customLevels
			} : void 0;
			const childUseOnlyCustomLevels = options.useOnlyCustomLevels ?? state.useOnlyCustomLevels;
			const childLevelComparison = options.levelComparison ?? state.levelComparison;
			const childLevels = options.customLevels !== void 0 || options.useOnlyCustomLevels !== void 0 || options.levelComparison !== void 0 ? buildLevelRegistry({
				customLevels: childCustomLevels,
				useOnlyCustomLevels: childUseOnlyCustomLevels,
				levelComparison: childLevelComparison
			}) : state.levels;
			const childLevel = options.level ?? state.level;
			assertLevelConfigured(childLevel, childLevels, childUseOnlyCustomLevels);
			const childState = {
				...state,
				level: childLevel,
				levelValue: childLevels.valueOf(childLevel),
				levels: childLevels,
				customLevels: childCustomLevels,
				useOnlyCustomLevels: childUseOnlyCustomLevels,
				levelComparison: childLevelComparison,
				enabled: options.enabled ?? state.enabled,
				bindings: mergeBindings(state.bindings, bindings),
				serializers: options.serializers === void 0 ? state.serializers : createSerializers(options.serializers, options.errorKey ?? state.errorKey, state.serializers),
				redact: options.redact !== void 0 ? normalizeRedact(options.redact) : state.redact,
				timestamp: options.timestamp ?? state.timestamp,
				messageKey: options.messageKey ?? state.messageKey,
				errorKey: options.errorKey ?? state.errorKey,
				nestedKey: options.nestedKey ?? state.nestedKey,
				msgPrefix: childPrefix,
				formatters: mergeFormatters(state.formatters, options.formatters),
				hooks: options.hooks ?? state.hooks,
				mixin: options.mixin ?? state.mixin,
				mixinMergeStrategy: options.mixinMergeStrategy ?? state.mixinMergeStrategy,
				lineEnding: options.crlf === true ? "\r\n" : state.lineEnding,
				encode: {
					depthLimit: options.depthLimit ?? state.encode.depthLimit,
					edgeLimit: options.edgeLimit ?? state.encode.edgeLimit
				},
				onChild: options.onChild ?? state.onChild,
				events: /* @__PURE__ */ new Map()
			};
			const child = createLogger(childState);
			childState.onChild?.(child);
			return child;
		},
		bindings() {
			if (state.formatters.bindings !== void 0) return copyBindings(formatBindings(state));
			return copyBindings(state.bindings);
		},
		setBindings(bindings) {
			state.bindings = mergeBindings(state.bindings, bindings);
		},
		flush() {
			return state.backend.flush();
		},
		isLevelEnabled(level) {
			return state.enabled && state.levels.isEnabled(state.level, level);
		},
		on(event, listener) {
			addEventListener(state.events, event, listener);
			return logger;
		},
		once(event, listener) {
			const onceListener = (...args) => {
				logger.removeListener(event, onceListener);
				listener(...args);
			};
			addEventListener(state.events, event, onceListener);
			return logger;
		},
		addListener(event, listener) {
			return logger.on(event, listener);
		},
		removeListener(event, listener) {
			state.events.get(event)?.delete(listener);
			return logger;
		},
		emit(event, ...args) {
			return emitEvent(state.events, event, args);
		},
		get level() {
			return state.level;
		},
		set level(level) {
			const previousLevel = state.level;
			const previousValue = state.levels.valueOf(previousLevel);
			const newValue = state.levels.valueOf(level);
			state.level = level;
			state.levelValue = newValue;
			if (previousLevel !== level) logger.emit("level-change", level, newValue, previousLevel, previousValue, logger);
		},
		get levelVal() {
			return state.levels.valueOf(state.level);
		},
		get levels() {
			return {
				values: state.levels.values,
				labels: state.levels.labels
			};
		},
		get version() {
			return version;
		},
		get msgPrefix() {
			return state.msgPrefix;
		},
		get enabled() {
			return state.enabled;
		},
		set enabled(value) {
			state.enabled = value;
		}
	};
	Object.defineProperty(logger, symbols.serializers, {
		enumerable: false,
		value: state.serializers
	});
	if (state.useOnlyCustomLevels === true) for (const name of CORE_LEVEL_NAMES) delete logger[name];
	if (state.customLevels !== void 0) {
		const dynamic = logger;
		for (const name of Object.keys(state.customLevels)) dynamic[name] = createLogMethod(state, name, state.levels.valueOf(name));
	}
	return logger;
}
function createLogMethod(state, level, levelValue) {
	return function logMethod(objOrMsg, msg, ...args) {
		if (!state.enabled) return;
		if (state.levels.isAsc ? levelValue < state.levelValue : !state.levels.isEnabled(state.level, level)) return;
		const rawMethod = (nextObjOrMsg, nextMsg, ...nextArgs) => {
			const record = buildRecord(state, level, levelValue, nextObjOrMsg, nextMsg, nextArgs);
			state.backend.write(formatJsonLine(record, state.encode), levelValue);
		};
		if (state.hooks?.logMethod !== void 0) {
			state.hooks.logMethod.call(this, [
				objOrMsg,
				msg,
				...args
			].filter(trimTrailingUndefined), rawMethod, levelValue);
			return;
		}
		rawMethod(objOrMsg, msg, ...args);
	};
}
function buildRecord(state, level, levelValue, objOrMsg, msg, args) {
	const record = {};
	Object.assign(record, formatLevel(state, level, levelValue));
	const timeFields = createTimestampFields(state.timestamp);
	Object.assign(record, timeFields);
	Object.assign(record, formatBindings(state));
	let logObject = normalizeLogArguments(objOrMsg, msg, args, {
		errorKey: state.errorKey,
		messageKey: state.messageKey,
		msgPrefix: state.msgPrefix,
		nestedKey: state.nestedKey
	});
	const mixin = state.mixin?.();
	if (mixin !== void 0) logObject = state.mixinMergeStrategy === void 0 ? {
		...mixin,
		...logObject
	} : state.mixinMergeStrategy(logObject, mixin);
	if (state.formatters.log !== void 0) logObject = state.formatters.log(logObject);
	Object.assign(record, logObject);
	return redactRecord(serializeErrorValues(applySerializers(record, state.serializers)), state.redact);
}
function normalizeFactoryArguments(optionsOrDestination, maybeDestination) {
	if (isWritableDestination(optionsOrDestination)) return {
		options: {},
		destination: optionsOrDestination
	};
	const options = optionsOrDestination;
	return {
		options,
		destination: maybeDestination ?? options.destination
	};
}
function createDefaultBaseFields(options) {
	if (options.base === false || options.base === null) return {};
	if (options.base !== void 0) return {};
	const fields = { pid: Deno.pid };
	try {
		fields.hostname = Deno.hostname();
	} catch {}
	return fields;
}
function createSerializers(serializers, errorKey, parent = {}) {
	return {
		err: errSerializer,
		[errorKey]: errSerializer,
		...parent,
		...serializers
	};
}
function mergeFormatters(parent, child) {
	return child === void 0 ? parent : {
		...parent,
		...child
	};
}
function formatLevel(state, level, value) {
	return state.formatters.level?.(level, value) ?? { level: value };
}
function formatBindings(state) {
	const bindings = {
		...state.baseFields,
		...state.bindings
	};
	return state.formatters.bindings?.(bindings) ?? bindings;
}
function createTimestampFields(option) {
	if (option === false) return {};
	if (typeof option === "function") {
		const value = option();
		if (typeof value === "number") return { time: value };
		return parseTimestampFragment(value);
	}
	return { time: Date.now() };
}
function parseTimestampFragment(fragment) {
	const trimmed = fragment.trim();
	if (trimmed.length === 0) return {};
	const json = trimmed.startsWith(",") ? trimmed.slice(1) : trimmed;
	try {
		return JSON.parse(`{${json}}`);
	} catch {
		return {};
	}
}
function addEventListener(events, event, listener) {
	const listeners = events.get(event) ?? /* @__PURE__ */ new Set();
	listeners.add(listener);
	events.set(event, listeners);
}
function emitEvent(events, event, args) {
	const listeners = events.get(event);
	if (listeners === void 0 || listeners.size === 0) return false;
	for (const listener of [...listeners]) listener(...args);
	return true;
}
function trimTrailingUndefined(value, index, values) {
	if (value !== void 0) return true;
	return values.slice(index + 1).some((candidate) => candidate !== void 0);
}
function notImplemented(feature) {
	return () => {
		throw new Error(`pequi.${feature} is not implemented. Worker transports are not part of Pequi core yet.`);
	};
}

//#endregion
export { DEFAULT_LEVEL, NativeBackendUnavailable, PequiError, PequiNativeError, UnsupportedDestinationError, copyBindings, createBackend, createBaseBindings, pequi as default, pequi, destination, discardDestination, fileDestination, formatJsonLine, formatMessage, isLevelEnabled, isLogLevel, levelToNumber, levels, memoryDestination, mergeBindings, multistream, normalizeLogArguments, pino, pinoLevels, resolveBackend, safeStableStringify, stdSerializers, stdTimeFunctions, stderrDestination, stdoutDestination, symbols, version };
//# sourceMappingURL=pequi.bundle.js.map