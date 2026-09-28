export type LogLevel = "debug" | "info" | "warn" | "error";
const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = "info";
export function setLogLevel(l: LogLevel): void {
  minLevel = l;
}

function out(level: LogLevel, scope: string, msg: string): void {
  if (order[level] < order[minLevel]) return;
  const line = `[NOCTERRA][${scope}] ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logger(scope: string) {
  return {
    debug: (m: string) => out("debug", scope, m),
    info: (m: string) => out("info", scope, m),
    warn: (m: string) => out("warn", scope, m),
    error: (m: string) => out("error", scope, m),
  };
}
