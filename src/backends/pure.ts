/**
 * The pure TypeScript backend.
 *
 * The default {@linkcode Backend}: it appends the line ending and writes through a
 * {@linkcode DestinationSink}. Available directly as the `@pequi/log/pure` export.
 *
 * @module
 */

import { createDestinationSink, type DestinationSink } from "../destination.ts";
import type { Backend, Destination } from "../types.ts";

/** Options for {@linkcode PureBackend}. */
export interface PureBackendOptions {
  /** Where to write; defaults to stdout. */
  destination?: Destination;
  /** Line ending appended to each line; defaults to `"\n"`. */
  lineEnding?: "\n" | "\r\n";
}

/** A {@linkcode Backend} that writes encoded lines to a destination sink in pure TypeScript. */
export class PureBackend implements Backend {
  readonly #sink: DestinationSink;
  readonly #lineEnding: "\n" | "\r\n";

  constructor(options: PureBackendOptions = {}) {
    this.#sink = createDestinationSink(options.destination);
    this.#lineEnding = options.lineEnding ?? "\n";
  }

  write(line: string, level?: number): void {
    this.#sink.write(`${line}${this.#lineEnding}`, level);
  }

  flush(): void {
    this.#sink.flush();
  }

  close(): void {
    this.#sink.close();
  }
}

/**
 * Construct a {@linkcode PureBackend}.
 *
 * @param options Destination and line-ending options.
 * @returns A new pure backend.
 */
export function createPureBackend(options: PureBackendOptions = {}): Backend {
  return new PureBackend(options);
}
