import { type EncodeOptions, safeStableStringify } from "./encode.ts";
import { isError } from "./serializers.ts";

export interface NormalizeLogArgumentsOptions {
  errorKey: string;
  messageKey: string;
  msgPrefix: string;
  nestedKey?: string;
}

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

export function formatMessage(template: string, args: unknown[]): string {
  if (args.length === 0) {
    return template;
  }

  let index = 0;
  const formatted = template.replace(/%([sdjoO%])/g, (match, token: string) => {
    if (token === "%") {
      return "%";
    }

    if (index >= args.length) {
      return match;
    }

    const value = args[index++];
    if (token === "d") {
      return Number(value).toString();
    }

    if (token === "j" || token === "o" || token === "O") {
      return stringifyMessageArg(value);
    }

    return String(value);
  });

  const rest = args.slice(index).map(stringifyMessageArg);
  return rest.length === 0 ? formatted : `${formatted} ${rest.join(" ")}`;
}

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

function stringifyMessageArg(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (isError(value)) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "[Circular]";
  }
}

function isLogObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
