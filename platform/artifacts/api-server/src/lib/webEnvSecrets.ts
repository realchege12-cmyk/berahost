import crypto from "crypto";

const PREFIX = "berahost-env:v1:";

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret === "fallback-secret-change-me") {
    throw new Error("SESSION_SECRET must be configured before storing deployment environment values.");
  }
  return crypto.createHash("sha256").update(`berahost-web-env:v1:${secret}`).digest();
}

export function encryptWebEnvVars(values: Record<string, string>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(values), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

/** Existing rows stored as a JSON object are returned as-is for backwards compatibility. */
export function decryptWebEnvVars(value: unknown): Record<string, string> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => typeof entry === "string")) as Record<string, string>;
  }
  if (typeof value !== "string" || !value.startsWith(PREFIX)) {
    throw new Error("Stored deployment environment values have an unsupported format.");
  }
  const [ivText, tagText, ciphertextText] = value.slice(PREFIX.length).split(":");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Stored deployment environment values are incomplete.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Stored deployment environment values are invalid.");
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, entry]) => typeof entry === "string")) as Record<string, string>;
}
