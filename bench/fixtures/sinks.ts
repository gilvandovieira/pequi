import { discardDestination, memoryDestination } from "../../mod.ts";

export const discardSink = discardDestination();
export const memorySink = memoryDestination();

export function resetMemorySink(): void {
  memorySink.lines.length = 0;
}
