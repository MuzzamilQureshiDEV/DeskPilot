import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { serverEnv } from "@/lib/env";

// AES-256-GCM for secrets at rest (Shopify and future OAuth tokens).
// Format: v1.<iv>.<tag>.<ciphertext>, each part base64url. The version prefix
// lets us change algorithm or key later without guessing.

const VERSION = "v1";
const IV_BYTES = 12;

function envKey(): Buffer {
  const raw = serverEnv().ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  return Buffer.from(raw, "base64");
}

export function encryptWithKey(plaintext: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptWithKey(blob: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = blob.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unrecognised encrypted value");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export const encrypt = (plaintext: string) => encryptWithKey(plaintext, envKey());
export const decrypt = (blob: string) => decryptWithKey(blob, envKey());
