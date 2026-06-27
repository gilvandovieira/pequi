// @ts-self-types="./pequi.bundle.d.ts"
//#region src/destination.ts
const encoder$1 = new TextEncoder();
function stdoutDestination() {
	return { type: "stdout" };
}
function stderrDestination() {
	return { type: "stderr" };
}
function fileDestination(path, options = {}) {
	return {
		type: "file",
		path,
		append: options.append
	};
}
function memoryDestination(lines = []) {
	return {
		type: "memory",
		lines
	};
}
function discardDestination() {
	return { type: "discard" };
}
function isWritableDestination(value) {
	return typeof value === "object" && value !== null && typeof value.write === "function";
}
function isConfiguredDestination(value) {
	return typeof value === "object" && value !== null && typeof value.type === "string";
}
function destination(target) {
	if (target === void 0 || target === 1 || target === "stdout") return createDestinationSink(stdoutDestination());
	if (target === 2 || target === "stderr") return createDestinationSink(stderrDestination());
	if (typeof target === "string") return createDestinationSink(fileDestination(target));
	if (typeof target === "number") throw new TypeError(`Unsupported destination fd: ${target}`);
	if (isWritableDestination(target)) return target;
	return createDestinationSink(target);
}
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
function createPureBackend(options = {}) {
	return new PureBackend(options);
}

//#endregion
//#region src/errors.ts
var PequiError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "PequiError";
	}
};
var PequiNativeError = class extends PequiError {
	statusCode;
	operation;
	destinationKind;
	diagnostics;
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
var NativeBackendUnavailable = class extends PequiNativeError {
	constructor(message, options) {
		super(message, options);
		this.name = "NativeBackendUnavailable";
	}
};
var UnsupportedDestinationError = class extends PequiError {
	constructor(message) {
		super(message);
		this.name = "UnsupportedDestinationError";
	}
};
var InvalidLogLevelError = class extends PequiError {
	constructor(level) {
		super(`Invalid log level: ${level}`);
		this.name = "InvalidLogLevelError";
	}
};

//#endregion
//#region src/backends/native.ts
const NATIVE_ABI_VERSION = 1;
const supportedTargets = {
	"linux-x86_64": "linux-x86_64-gnu",
	"linux-aarch64": "linux-aarch64-gnu"
};
const rustTargetTriples = {
	"linux-x86_64": "x86_64-unknown-linux-gnu",
	"linux-aarch64": "aarch64-unknown-linux-gnu"
};
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
function resolveNativeTarget() {
	if (Deno.build.os !== "linux") return;
	return supportedTargets[`${Deno.build.os}-${Deno.build.arch}`];
}
function resolveNativeLibraryPath() {
	const target = resolveNativeTarget();
	if (target === void 0) return;
	return urlPath(new URL(`../../prebuilt/${target}/libpequi_log.so`, import.meta.url));
}
function resolveNativeLibraryCandidates(libraryPath) {
	if (libraryPath !== void 0) return [libraryPath];
	const prebuiltPath = resolveNativeLibraryPath();
	if (prebuiltPath === void 0) return [];
	const candidates = [prebuiltPath, urlPath(new URL("../../native/rust/target/release/libpequi_log.so", import.meta.url))];
	const rustTriple = resolveRustTargetTriple();
	if (rustTriple !== void 0) candidates.push(urlPath(new URL(`../../native/rust/target/${rustTriple}/release/libpequi_log.so`, import.meta.url)));
	return [...new Set(candidates)];
}
function getNativeLoadInfo(libraryPath) {
	return {
		os: Deno.build.os,
		arch: Deno.build.arch,
		target: resolveNativeTarget(),
		attemptedLibraryPaths: resolveNativeLibraryCandidates(libraryPath)
	};
}
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
function createNativeBackendResult(options = {}) {
	const requestedMode = options.mode ?? "required";
	const loadInfo = getNativeLoadInfo(options.libraryPath);
	const destination = resolveNativeDestination(options.destination, loadInfo, requestedMode);
	const bufferSize = normalizeBufferSize(options.bufferSize, loadInfo, requestedMode);
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
function normalizeBufferSize(bufferSize, loadInfo, requestedMode) {
	if (bufferSize === void 0) return 0;
	if (!Number.isSafeInteger(bufferSize) || bufferSize < 0) throw nativeStartupError(`Invalid native buffer size: ${bufferSize}. Expected a non-negative safe integer.`, loadInfo, requestedMode, void 0, { nativeErrorMessage: "invalid native buffer size" });
	return bufferSize;
}
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
function createBackend(options = {}) {
	return resolveBackend(options).backend;
}
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
function createBaseBindings(options = {}) {
	const bindings = {};
	if (options.base !== false && options.base !== null && options.base !== void 0) Object.assign(bindings, options.base);
	if (options.name !== void 0) bindings.name = options.name;
	return bindings;
}
function mergeBindings(parent, child) {
	return {
		...parent,
		...child
	};
}
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
function isError(value) {
	return value instanceof Error;
}
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
function errSerializer(value) {
	return isError(value) ? serializeError(value) : value;
}
function errWithCauseSerializer(value) {
	return isError(value) ? serializeError(value) : value;
}
const stdSerializers = {
	err: errSerializer,
	errWithCause: errWithCauseSerializer
};
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
const levels = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60,
	silent: Infinity
};
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
const DEFAULT_LEVEL = "info";
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
function isLogLevel(value) {
	return levelNames.has(value);
}
function levelToNumber(level) {
	const value = levels[level];
	if (value === void 0) throw new InvalidLogLevelError(level);
	return value;
}
function isLevelEnabled(currentLevel, candidateLevel) {
	return levelToNumber(candidateLevel) >= levelToNumber(currentLevel);
}
function ascCompare(candidate, active) {
	return candidate >= active;
}
function descCompare(candidate, active) {
	return candidate <= active;
}
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
const DEFAULT_CENSOR = "[Redacted]";
const IMMUTABLE_ROOT_KEYS = /* @__PURE__ */ new Set(["level", "time"]);
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
const version = "0.5.0";
const symbols = {
	serializers: Symbol.for("pino.serializers"),
	serializersSym: Symbol.for("pino.serializers")
};
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