import type { WritableDestination } from "../../../mod.ts";

export interface CaptureDestination extends WritableDestination {
  readonly chunks: string[];
  records(): Record<string, unknown>[];
  text(): string;
}

export function createCaptureDestination(): CaptureDestination {
  const chunks: string[] = [];
  return {
    chunks,
    write(chunk: string): boolean {
      chunks.push(chunk);
      return true;
    },
    records(): Record<string, unknown>[] {
      return chunks.flatMap(parseChunk);
    },
    text(): string {
      return chunks.join("");
    },
  };
}

function parseChunk(chunk: string): Record<string, unknown>[] {
  return chunk.split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
