import { createHash } from "node:crypto";

/**
 * Hash of the prompt text a benchmark result was produced against.
 * If the prompt changes, stored results no longer match and are shown as stale.
 * Line endings and surrounding whitespace are normalized so that
 * editor/OS noise doesn't invalidate results.
 */
export function promptHash(body: string): string {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
