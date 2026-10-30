import test from "node:test";
import assert from "node:assert/strict";
import { decryptWebEnvVars, encryptWebEnvVars } from "../src/lib/webEnvSecrets.ts";

test("environment values are encrypted and decrypt only with the server secret", () => {
  process.env.SESSION_SECRET = "unit-test-session-secret-with-adequate-entropy";
  const input = { API_TOKEN: "sensitive-value", FEATURE_FLAG: "on" };
  const stored = encryptWebEnvVars(input);
  assert.match(stored, /^berahost-env:v1:/);
  assert.equal(stored.includes("sensitive-value"), false);
  assert.deepEqual(decryptWebEnvVars(stored), input);
});

test("authenticated encryption rejects modified ciphertext", () => {
  process.env.SESSION_SECRET = "unit-test-session-secret-with-adequate-entropy";
  const stored = encryptWebEnvVars({ SECRET: "one" });
  const parts = stored.split(":");
  const tagIndex = 3;
  parts[tagIndex] = `${parts[tagIndex][0] === "A" ? "B" : "A"}${parts[tagIndex].slice(1)}`;
  assert.throws(() => decryptWebEnvVars(parts.join(":")));
});

test("legacy plaintext JSONB objects remain readable during migration", () => {
  assert.deepEqual(decryptWebEnvVars({ OLD_KEY: "old-value", number: 3 }), { OLD_KEY: "old-value" });
});

test("encryption fails closed when SESSION_SECRET is missing", () => {
  const previous = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  assert.throws(() => encryptWebEnvVars({ SECRET: "value" }), /SESSION_SECRET/);
  if (previous !== undefined) process.env.SESSION_SECRET = previous;
});
