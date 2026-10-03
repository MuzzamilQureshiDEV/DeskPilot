import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { appUrlFromEnv, publicEnvSchema, serverEnvSchema } from "@/lib/env-schema";

const base = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("appUrlFromEnv", () => {
  it("prefers NEXT_PUBLIC_APP_URL, then Vercel's production domain", () => {
    expect(appUrlFromEnv({ NEXT_PUBLIC_APP_URL: "https://app.example.com", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe(
      "https://app.example.com",
    );
    expect(appUrlFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: "deskpilot-seven.vercel.app" })).toBe(
      "https://deskpilot-seven.vercel.app",
    );
    expect(appUrlFromEnv({})).toBeUndefined();
  });
});

describe("env schemas", () => {
  it("accepts the minimum required server env", () => {
    expect(serverEnvSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a missing service role key", () => {
    const env: Partial<typeof base> = { ...base };
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    expect(serverEnvSchema.safeParse(env).success).toBe(false);
  });

  it("rejects a non-URL Supabase URL", () => {
    const result = publicEnvSchema.safeParse({
      ...base,
      NEXT_PUBLIC_SUPABASE_URL: "not a url",
    });
    expect(result.success).toBe(false);
  });

  it("requires ENCRYPTION_KEY to decode to 32 bytes", () => {
    const good = randomBytes(32).toString("base64");
    const bad = randomBytes(16).toString("base64");
    expect(
      serverEnvSchema.safeParse({ ...base, ENCRYPTION_KEY: good }).success,
    ).toBe(true);
    expect(
      serverEnvSchema.safeParse({ ...base, ENCRYPTION_KEY: bad }).success,
    ).toBe(false);
  });
});
