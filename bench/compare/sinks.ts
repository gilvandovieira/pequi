export interface SinkStats {
  writes: number;
  bytes: number;
}

export interface BenchmarkSink {
  write(chunk: string): boolean;
  reset(): void;
  stats(): SinkStats;
  flush?(): void;
  end?(): void;
}

export interface MemoryBenchmarkSink extends BenchmarkSink {
  lines(): string[];
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
    reset(): void {
      writes = 0;
      bytes = 0;
    },
    stats(): SinkStats {
      return { writes, bytes };
    },
    flush(): void {},
    end(): void {},
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
    flush(): void {},
    end(): void {},
  };
}
