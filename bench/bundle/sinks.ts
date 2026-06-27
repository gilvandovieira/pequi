export type BundleDestinationKind = "discard" | "memory" | "file";

export interface SinkStats {
  writes: number;
  bytes: number;
}

export interface BenchmarkSink {
  write(chunk: string): boolean;
  flush(): void;
  end(): void;
  reset(): void;
  stats(): SinkStats;
}

export interface MemoryBenchmarkSink extends BenchmarkSink {
  lines(): string[];
}

export interface FileBenchmarkSink extends BenchmarkSink {
  readonly path: string;
  text(): string;
}

export function createDiscardSink(): BenchmarkSink {
  let writes = 0;
  let bytes = 0;

  return {
    write(chunk: string): boolean {
      writes += 1;
      bytes += chunk.length;
      return true;
    },
    flush(): void {},
    end(): void {},
    reset(): void {
      writes = 0;
      bytes = 0;
    },
    stats(): SinkStats {
      return { writes, bytes };
    },
  };
}

export function createMemorySink(): MemoryBenchmarkSink {
  const chunks: string[] = [];
  let writes = 0;
  let bytes = 0;

  return {
    write(chunk: string): boolean {
      writes += 1;
      bytes += chunk.length;
      chunks.push(chunk);
      return true;
    },
    flush(): void {},
    end(): void {},
    reset(): void {
      writes = 0;
      bytes = 0;
      chunks.length = 0;
    },
    lines(): string[] {
      return chunks.flatMap((chunk) => chunk.split(/\r?\n/).filter((line) => line.length > 0));
    },
    stats(): SinkStats {
      return { writes, bytes };
    },
  };
}

export function createFileSink(path: string): FileBenchmarkSink {
  let file = Deno.openSync(path, {
    write: true,
    create: true,
    truncate: true,
  });
  let writes = 0;
  let bytes = 0;

  return {
    path,
    write(chunk: string): boolean {
      const encoded = new TextEncoder().encode(chunk);
      writes += 1;
      bytes += encoded.byteLength;
      file.writeSync(encoded);
      return true;
    },
    flush(): void {
      file.syncSync();
    },
    end(): void {
      file.close();
    },
    reset(): void {
      file.close();
      Deno.writeTextFileSync(path, "");
      file = Deno.openSync(path, {
        write: true,
        create: true,
        truncate: false,
        append: true,
      });
      writes = 0;
      bytes = 0;
    },
    text(): string {
      this.flush();
      return Deno.readTextFileSync(path);
    },
    stats(): SinkStats {
      return { writes, bytes };
    },
  };
}

export function parseJsonLines(text: string): Record<string, unknown>[] {
  return text.split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
