import type {
  ConfiguredDestination,
  Destination,
  FileDestination,
  MemoryDestination,
  WritableDestination,
} from "./types.ts";

export interface DestinationSink {
  write(chunk: string, level?: number): void;
  flush(): void | Promise<void>;
  close(): void | Promise<void>;
}

const encoder = new TextEncoder();

export function stdoutDestination(): ConfiguredDestination {
  return { type: "stdout" };
}

export function stderrDestination(): ConfiguredDestination {
  return { type: "stderr" };
}

export function fileDestination(path: string, options: { append?: boolean } = {}): FileDestination {
  return { type: "file", path, append: options.append };
}

export function memoryDestination(lines: string[] = []): MemoryDestination {
  return { type: "memory", lines };
}

export function discardDestination(): ConfiguredDestination {
  return { type: "discard" };
}

export function isWritableDestination(value: unknown): value is WritableDestination {
  return typeof value === "object" && value !== null &&
    typeof (value as { write?: unknown }).write === "function";
}

export function isConfiguredDestination(value: unknown): value is ConfiguredDestination {
  return typeof value === "object" && value !== null &&
    typeof (value as { type?: unknown }).type === "string";
}

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
