import { assertEquals } from "@std/assert";
import { runBothOracles } from "./oracle/pequi_oracle.ts";
import { callMethod, childLogger } from "./oracle/pino_oracle.ts";

Deno.test({
  name: "custom level methods emit the same records as Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null, customLevels: { http: 35, audit: 45 }, level: "http" },
      (log) => {
        callMethod(log, "http", "request received");
        callMethod(log, "audit", { userId: "1" }, "access granted");
        callMethod(log, "info", "still a core level");
        callMethod(log, "debug", "below threshold, dropped");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "useOnlyCustomLevels matches Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      {
        timestamp: false,
        base: null,
        customLevels: { low: 10, mid: 20, high: 30 },
        useOnlyCustomLevels: true,
        level: "mid",
      },
      (log) => {
        callMethod(log, "high", "emitted");
        callMethod(log, "mid", "emitted");
        callMethod(log, "low", "below threshold, dropped");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "levelComparison DESC matches Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      {
        timestamp: false,
        base: null,
        customLevels: { a: 10, b: 20, c: 30 },
        useOnlyCustomLevels: true,
        level: "b",
        levelComparison: "DESC",
      },
      (log) => {
        callMethod(log, "a", "more severe, emitted");
        callMethod(log, "b", "equal, emitted");
        callMethod(log, "c", "less severe, dropped");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "children inherit custom level methods like Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null, customLevels: { http: 35 }, level: "http" },
      (log) => {
        const child = childLogger(log, { module: "api" });
        callMethod(child, "http", "inherited custom level");
        callMethod(child, "info", "core level still works");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});

Deno.test({
  name: "children can add custom levels like Pino",
  permissions: { env: ["NODE_V8_COVERAGE"], sys: ["hostname"] },
  async fn() {
    const { pinoRecords, pequiRecords } = await runBothOracles(
      { timestamp: false, base: null, customLevels: { http: 35 }, level: "debug" },
      (log) => {
        const child = childLogger(log, { module: "api" }, { customLevels: { audit: 45 } });
        callMethod(child, "audit", "child-defined custom level");
      },
    );

    assertEquals(pequiRecords, pinoRecords);
  },
});
