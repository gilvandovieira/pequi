/**
 * Argument normalization, printf-style message formatting, and JSON-line encoding.
 *
 * {@linkcode normalizeLogArguments} turns Pino-style call arguments into a log record,
 * {@linkcode formatMessage} implements the `quick-format-unescaped` placeholder rules, and
 * {@linkcode formatJsonLine} encodes a record to a single JSON line (with a safe fallback).
 *
 * @module
 */

import { type EncodeOptions, safeStableStringify } from "./encode.ts";
import { isError } from "./serializers.ts";

/** Field-name and prefix configuration for {@linkcode normalizeLogArguments}. */
export interface NormalizeLogArgumentsOptions {
  /** Key under which an Error argument is serialized. */
  errorKey: string;
  /** Key under which the message string is placed. */
  messageKey: string;
  /** String prepended to the message. */
  msgPrefix: string;
  /** If set, log-object fields are nested under this key. */
  nestedKey?: string;
}

/**
 * Normalize a level method's arguments into a log record, matching Pino's call shapes (merge
 * object, Error, and/or printf-style message with arguments).
 *
 * @param objOrMsg The first argument: a merge object, an Error, or a message string.
 * @param msg An optional message string when the first argument is an object/Error.
 * @param args Remaining printf-style format arguments.
 * @param options Field-name and prefix configuration.
 * @returns The assembled log record (before bindings, level, and time are added).
 */
export function normalizeLogArguments(
  objOrMsg: unknown,
  msg: string | undefined,
  args: unknown[],
  options: NormalizeLogArgumentsOptions = {
    errorKey: "err",
    messageKey: "msg",
    msgPrefix: "",
  },
): Record<string, unknown> {
  if (objOrMsg === undefined) {
    return msg === undefined ? {} : withMessage(formatMessage(msg, args), options);
  }

  if (objOrMsg === null) {
    return msg === undefined
      ? withMessage(null, options)
      : withMessage(formatMessage(msg, args), options);
  }

  if (isError(objOrMsg)) {
    const record: Record<string, unknown> = options.nestedKey === undefined
      ? { [options.errorKey]: objOrMsg }
      : { [options.nestedKey]: { [options.errorKey]: objOrMsg } };
    record[options.messageKey] = options.msgPrefix +
      (msg === undefined ? objOrMsg.message : formatMessage(msg, args));
    return record;
  }

  if (isLogObject(objOrMsg)) {
    const record = applyNestedKey({ ...objOrMsg }, options.nestedKey);
    if (msg !== undefined) {
      record[options.messageKey] = options.msgPrefix + formatMessage(msg, args);
    }
    return record;
  }

  const messageArgs = msg === undefined ? args : [msg, ...args];
  return withMessage(formatMessage(String(objOrMsg), messageArgs), options);
}

/**
 * Mirrors Pino's `quick-format-unescaped` rather than Node's `util.format`: `%i` floors,
 * `%d`/`%f` coerce with `Number`, `%j`/`%o`/`%O` JSON-encode (circular-safe), `%c` and unknown
 * tokens stay literal, and leftover arguments are dropped instead of appended.
 *
 * @param template The message template, possibly containing `%` placeholders.
 * @param args Values substituted into the placeholders, in order.
 * @returns The formatted message string.
 */
export function formatMessage(template: string, args: unknown[]): string {
  if (args.length === 0) {
    return template;
  }

  // Slice literal runs between `%` tokens instead of concatenating char-by-char.
  let pct = template.indexOf("%");
  if (pct === -1) {
    return template;
  }

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
      // Unknown token or no argument left: leave the `%` literal and keep scanning.
      pct = template.indexOf("%", pct + 1);
      continue;
    }
    pct = template.indexOf("%", last);
  }

  return last === 0 ? template : result + template.slice(last);
}

function isFormatToken(token: string): boolean {
  return token === "s" || token === "d" || token === "i" || token === "f" ||
    token === "j" || token === "o" || token === "O";
}

function formatToken(token: string, value: unknown): string {
  switch (token) {
    case "s":
      return String(value);
    case "d":
    case "f":
      return Number(value).toString();
    case "i":
      return Math.floor(Number(value)).toString();
    default: // "j", "o", "O"
      return safeStableStringify(value);
  }
}

/**
 * Encode a log record as a single JSON line.
 *
 * Uses native `JSON.stringify` on the fast path and falls back to {@linkcode safeStableStringify}
 * when it throws (circular references, `BigInt`) or when depth/edge limits are requested.
 *
 * @param record The fully assembled log record.
 * @param options Optional depth/edge truncation limits.
 * @returns The encoded JSON line (without a trailing newline).
 */
export function formatJsonLine(
  record: Record<string, unknown>,
  options: EncodeOptions = {},
): string {
  // Fast path: native `JSON.stringify` produces identical output for serializable records.
  // Only fall back to the safe encoder when it throws (circular references, BigInt) or when
  // depth/edge limits are requested.
  if (options.depthLimit === undefined && options.edgeLimit === undefined) {
    try {
      return JSON.stringify(record);
    } catch {
      return safeStableStringify(record);
    }
  }
  return safeStableStringify(record, options);
}

function withMessage(
  message: unknown,
  options: NormalizeLogArgumentsOptions,
): Record<string, unknown> {
  return {
    [options.messageKey]: typeof message === "string" ? options.msgPrefix + message : message,
  };
}

function applyNestedKey(
  object: Record<string, unknown>,
  nestedKey: string | undefined,
): Record<string, unknown> {
  if (nestedKey === undefined) {
    return object;
  }

  return { [nestedKey]: object };
}

function isLogObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
