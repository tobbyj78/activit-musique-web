export function safeJsonParse(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  if (value instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(value));
  }

  if (value instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(value));
  }

  throw new Error("Unsupported message payload");
}
