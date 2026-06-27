/**
 * Destination descriptors and sinks.
 *
 * Provides the small factory helpers for built-in destinations (`stdout`, `stderr`, file, memory,
 * discard) and {@linkcode createDestinationSink}, which turns a {@linkcode Destination} into a
 * concrete write/flush/close {@linkcode DestinationSink} the backend drives.
 *
 * @module
 */

import type {
  ConfiguredDestination,
  Destination,
  FileDestination,
  MemoryDestination,
  WritableDestination,
} from "./types.ts";

/** The concrete write/flush/close sink a backend drives. */
export interface DestinationSink {
  /** Write one encoded line; `level` is forwarded for level-aware sinks (e.g. multistream). */
  write(chunk: string, level?: number): void;
  /** Flush buffered output. */
  flush(): void | Promise<void>;
  /** Release the sink. */
  close(): void | Promise<void>;
}

const encoder = new TextEncoder();

/** Create a stdout destination descriptor. */
export function stdoutDestination(): ConfiguredDestination {
  return { type: "stdout" };
}

/** Create a stderr destination descriptor. */
export function stderrDestination(): ConfiguredDestination {
  return { type: "stderr" };
}

/**
 * Create a file destination descriptor.
 *
 * @param path Filesystem path to write to.
 * @param options Set `append: false` to truncate instead of append.
 */
export function fileDestination(path: string, options: { append?: boolean } = {}): FileDestination {
  return { type: "file", path, append: options.append };
}

/**
 * Create an in-memory destination descriptor.
 *
 * @param lines Array that receives each encoded line; defaults to a new array.
 */
export function memoryDestination(lines: string[] = []): MemoryDestination {
  return { type: "memory", lines };
}

/** Create a discard destination descriptor (writes go nowhere). */
export function discardDestination(): ConfiguredDestination {
  return { type: "discard" };
}

/**
 * Type guard for a {@linkcode WritableDestination} (an object with a `write` method).
 *
 * @param value Candidate value.
 */
export function isWritableDestination(value: unknown): value is WritableDestination {
  return typeof value === "object" && value !== null &&
    typeof (value as { write?: unknown }).write === "function";
}

/**
 * Type guard for a {@linkcode ConfiguredDestination} (an object with a string `type`).
 *
 * @param value Candidate value.
 */
export function isConfiguredDestination(value: unknown): value is ConfiguredDestination {
  return typeof value === "object" && value !== null &&
    typeof (value as { type?: unknown }).type === "string";
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
export function destination(target?: string | number | Destination): WritableDestination {
  if (target === undefined || target === 1 || target === "stdout") {
    return createDestinationSink(stdoutDestination());
  }

  if (target === 2 || target === "stderr") {
    return createDestinationSink(stderrDestination());
  }

  if (typeof target === "string") {
    return createDestinationSink(fileDestination(target));
  }

  if (typeof target === "number") {
    throw new TypeError(`Unsupported destination fd: ${target}`);
  }

  if (isWritableDestination(target)) {
    return target;
  }

  return createDestinationSink(target);
}

/**
 * Build the concrete {@linkcode DestinationSink} for a destination.
 *
 * @param target A destination descriptor or custom writable; defaults to stdout.
 * @returns The matching sink implementation.
 */
export function createDestinationSink(
  target: Destination = stdoutDestination(),
): DestinationSink {
  if (isWritableDestination(target)) {
    return new WritableSink(target);
  }

  switch (target.type) {
    case "stdout":
      return new StdoutSink();
    case "stderr":
      return new StderrSink();
    case "file":
      return new FileSink(target);
    case "memory":
      return new MemorySink(target);
    case "discard":
      return new DiscardSink();
  }
}

class WritableSink implements DestinationSink {
  readonly #destination: WritableDestination;

  constructor(destination: WritableDestination) {
    this.#destination = destination;
  }

  write(chunk: string, level?: number): void {
    // Mirror Pino: expose the line's level on the destination so a multistream can route it.
    if (level !== undefined) {
      (this.#destination as { lastLevel?: number }).lastLevel = level;
    }
    this.#destination.write(chunk);
  }

  flush(): void | Promise<void> {
    return this.#destination.flush?.();
  }

  close(): void | Promise<void> {
    return this.#destination.end?.();
  }
}

class StdoutSink implements DestinationSink, WritableDestination {
  write(chunk: string): void {
    Deno.stdout.writeSync(encoder.encode(chunk));
  }

  flush(): void {}

  end(): void {}

  close(): void {}
}

class StderrSink implements DestinationSink, WritableDestination {
  write(chunk: string): void {
    Deno.stderr.writeSync(encoder.encode(chunk));
  }

  flush(): void {}

  end(): void {}

  close(): void {}
}

class FileSink implements DestinationSink, WritableDestination {
  #file: Deno.FsFile;

  constructor(target: FileDestination) {
    this.#file = Deno.openSync(target.path, {
      write: true,
      create: true,
      append: target.append ?? true,
      truncate: target.append === false,
    });
  }

  write(chunk: string): void {
    this.#file.writeSync(encoder.encode(chunk));
  }

  flush(): void {
    this.#file.syncSync();
  }

  end(): void {
    this.close();
  }

  close(): void {
    this.#file.close();
  }
}

class MemorySink implements DestinationSink, WritableDestination {
  readonly #destination: MemoryDestination;

  constructor(destination: MemoryDestination) {
    this.#destination = destination;
  }

  write(chunk: string): void {
    this.#destination.lines.push(chunk);
  }

  flush(): void {}

  end(): void {}

  close(): void {}
}

class DiscardSink implements DestinationSink, WritableDestination {
  write(_chunk: string): void {}

  flush(): void {}

  end(): void {}

  close(): void {}
}
