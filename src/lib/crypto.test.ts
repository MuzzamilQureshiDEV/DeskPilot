import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptWithKey, encryptWithKey } from "@/lib/crypto";

const key = randomBytes(32);

describe("AES-256-GCM secrets", () => {
  it("round-trips and never stores the plaintext", () => {
    const blob = encryptWithKey("shpat_secret-token", key);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob).not.toContain("shpat_secret-token");
    expect(decryptWithKey(blob, key)).toBe("shpat_secret-token");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptWithKey("same", key)).not.toBe(encryptWithKey("same", key));
  });

  it("rejects tampering and the wrong key", () => {
    const blob = encryptWithKey("token", key);
    const [v, iv, tag, ct] = blob.split(".");
    const flipped = Buffer.from(ct ?? "", "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => decryptWithKey([v, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
    expect(() => decryptWithKey(blob, randomBytes(32))).toThrow();
    expect(() => decryptWithKey("plain-token", key)).toThrow(/Unrecognised/);
  });

  it("requires a 32-byte key", () => {
    expect(() => encryptWithKey("x", randomBytes(16))).toThrow(/32 bytes/);
  });
});
