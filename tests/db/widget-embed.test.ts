import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET, OPTIONS, POST } from "@/app/api/widget/[key]/[action]/route";

import { adminClient, createTestUser, deleteTestUser, hasDbEnv, type Db, type TestUser } from "./helpers";

const ctx = (key: string, action: string) => ({ params: Promise.resolve({ key, action }) });

describe.skipIf(!hasDbEnv)("copy-paste chat embed endpoints (live DB)", () => {
  let admin: Db;
  let a: TestUser | undefined;
  let shopId = "";
  let key = "";

  beforeAll(async () => {
    admin = adminClient();
    a = await createTestUser(admin, { shopName: "Embed shop" });
    shopId = (await admin.from("shop_members").select("shop_id").eq("user_id", a.id).single()).data?.shop_id ?? "";
    await admin.from("shops").update({ widget: { title: "Talk to us", accent: "#7c3aed" } }).eq("id", shopId);
    key = (await admin.from("shops").select("widget_key").eq("id", shopId).single()).data?.widget_key ?? "";
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("shops").delete().eq("id", shopId);
    await deleteTestUser(admin, a);
  });

  it("answers CORS preflight and returns only the widget look", async () => {
    expect((OPTIONS()).headers.get("access-control-allow-origin")).toBe("*");
    const res = await GET(new NextRequest(`http://x/api/widget/${key}/config`), ctx(key, "config") as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body).toMatchObject({ title: "Talk to us", accent: "#7c3aed" });
    expect(Object.keys(body).sort()).toEqual(["accent", "chips", "greeting", "position", "subtitle", "title"]);
  });

  it("refuses unknown keys and unknown actions", async () => {
    expect((await GET(new NextRequest("http://x/api/widget/nope/config"), ctx("not-a-real-key-123456", "config") as never)).status).toBe(404);
    expect((await GET(new NextRequest(`http://x/api/widget/${key}/admin`), ctx(key, "admin") as never)).status).toBe(404);
    const badPost = await POST(new NextRequest(`http://x/api/widget/${key}/config`, { method: "POST", body: "{}" }), ctx(key, "config") as never);
    expect(badPost.status).toBe(404);
  });

  it("a shopper only reads their own thread (token required)", async () => {
    const res = await GET(new NextRequest(`http://x/api/widget/${key}/messages`), ctx(key, "messages") as never);
    expect(res.status).toBe(400);
  });
});
