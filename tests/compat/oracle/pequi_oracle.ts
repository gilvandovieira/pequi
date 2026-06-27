import { pequi } from "../../../mod.ts";
import { createCaptureDestination } from "./capture.ts";
import { type NormalizeOptions, normalizeRecords } from "./normalize.ts";
import { type OracleLogger, type OracleOperation, runPinoOracle } from "./pino_oracle.ts";

export function runPequiOracle(
  options: Record<string, unknown>,
  operation: OracleOperation,
  normalizeOptions: NormalizeOptions = {},
): Record<string, unknown>[] {
  const capture = createCaptureDestination();
  const logger = pequi(options, capture);
  operation(logger as unknown as OracleLogger);
  return normalizeRecords(capture.records(), normalizeOptions);
}

export async function runBothOracles(
  options: Record<string, unknown>,
  operation: OracleOperation,
  normalizeOptions: NormalizeOptions = {},
): Promise<{
  pinoRecords: Record<string, unknown>[];
  pequiRecords: Record<string, unknown>[];
}> {
  return {
    pinoRecords: await runPinoOracle(options, operation, normalizeOptions),
    pequiRecords: runPequiOracle(options, operation, normalizeOptions),
  };
}
