import { createDestinationSink, type DestinationSink } from "../destination.ts";
import type { Backend, Destination } from "../types.ts";

export interface PureBackendOptions {
  destination?: Destination;
  lineEnding?: "\n" | "\r\n";
}

export class PureBackend implements Backend {
  readonly #sink: DestinationSink;
  readonly #lineEnding: "\n" | "\r\n";

  constructor(options: PureBackendOptions = {}) {
    this.#sink = createDestinationSink(options.destination);
    this.#lineEnding = options.lineEnding ?? "\n";
  }

  write(line: string): void {
    this.#sink.write(`${line}${this.#lineEnding}`);
  }

  flush(): void {
    this.#sink.flush();
  }

  close(): void {
    this.#sink.close();
  }
}

export function createPureBackend(options: PureBackendOptions = {}): Backend {
  return new PureBackend(options);
}
