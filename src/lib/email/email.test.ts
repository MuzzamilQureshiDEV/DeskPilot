import { describe, expect, it, vi } from "vitest";

import { normalizeSubject, parseMailboxHash, replyAddress, shopAddress } from "@/lib/email/addresses";
import { classifyInbound, extractForwardingConfirmation, htmlToText, RATE_LIMIT } from "@/lib/email/filters";
import { messageIds, postmarkInboundSchema } from "@/lib/email/inbound";
import { postmarkBody, replySubject, sendEmail } from "@/lib/email/outbound";
import { authorized } from "@/lib/email/webhook-auth";

const BASE = "a0e71bd03ffec28b@inbound.postmarkapp.com";

describe("addresses", () => {
  it("builds shop and reply addresses", () => {
    expect(shopAddress(BASE, "abc123")).toBe("a0e71bd03ffec28b+abc123@inbound.postmarkapp.com");
    expect(replyAddress(BASE, "abc123", "def4567890")).toBe("a0e71bd03ffec28b+abc123.def4567890@inbound.postmarkapp.com");
  });

  it("parses mailbox hashes and rejects junk", () => {
    expect(parseMailboxHash("abc123")).toEqual({ shopHash: "abc123", replyToken: null });
    expect(parseMailboxHash("ABC123.def456")).toEqual({ shopHash: "abc123", replyToken: "def456" });
    for (const bad of ["", null, "xyz", "abc123.zz", "abc123.def456.fff111", "a'; drop"]) {
      expect(parseMailboxHash(bad)).toBeNull();
    }
  });

  it("normalises subjects for threading", () => {
    expect(normalizeSubject("Re: Fwd: RE:  Order   help")).toBe("order help");
    expect(normalizeSubject("AW: Re[2]: Hello")).toBe("hello");
    expect(normalizeSubject(null)).toBe("");
    expect(replySubject("Order help")).toBe("Re: Order help");
    expect(replySubject("RE: Order help")).toBe("RE: Order help");
    expect(replySubject("")).toBe("Re: Your message");
  });
});

describe("loop protection", () => {
  const ok = { from: "jamie@example.com", subject: "Help", headers: [] as { Name: string; Value: string }[], ownAddresses: ["support@shop.com"], recentFromSender: 0 };
  const reason = (over: Partial<typeof ok>) => {
    const r = classifyInbound({ ...ok, ...over });
    return r.accept ? "accept" : r.reason;
  };

  it("accepts a normal customer email", () => {
    expect(reason({})).toBe("accept");
    expect(reason({ headers: [{ Name: "Auto-Submitted", Value: "no" }] })).toBe("accept");
  });

  it.each([
    [{ headers: [{ Name: "auto-submitted", Value: "auto-replied" }] }, "auto_submitted"],
    [{ headers: [{ Name: "X-Autoreply", Value: "yes" }] }, "auto_reply_header"],
    [{ headers: [{ Name: "X-Auto-Response-Suppress", Value: "All" }] }, "auto_reply_header"],
    [{ headers: [{ Name: "Precedence", Value: "bulk" }] }, "bulk_precedence"],
    [{ headers: [{ Name: "Precedence", Value: "List" }] }, "bulk_precedence"],
    [{ from: "noreply@store.com" }, "no_reply_sender"],
    [{ from: "Do-Not-Reply@store.com" }, "no_reply_sender"],
    [{ from: "MAILER-DAEMON@mx.example.com" }, "no_reply_sender"],
    [{ from: "bounces+123@mail.example.com" }, "no_reply_sender"],
    [{ from: "Support@Shop.com" }, "own_address"],
    [{ recentFromSender: RATE_LIMIT.messages }, "rate_limited"],
    [{ from: "forwarding-noreply@google.com" }, "forwarding_confirmation"],
  ] as [Partial<typeof ok>, string][])("filters %o as %s", (over, expected) => {
    expect(reason(over)).toBe(expected);
  });

  it("allows the 5th message but not the 6th in the window", () => {
    expect(reason({ recentFromSender: RATE_LIMIT.messages - 1 })).toBe("accept");
  });

  it("extracts Gmail's forwarding confirmation", () => {
    const text =
      "Confirmation code: 834572910\n\nTo allow forwarding, click the link below:\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc\n";
    expect(extractForwardingConfirmation(text)).toEqual({ code: "834572910", link: "https://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc" });
    expect(extractForwardingConfirmation("hello")).toEqual({ code: null, link: null });
  });

  it("turns HTML into readable text", () => {
    expect(htmlToText("<style>p{}</style><p>Hi&nbsp;there</p><p>Order &amp; refund<br>Thanks</p>")).toBe("Hi there\nOrder & refund\nThanks");
  });
});

describe("inbound payload", () => {
  it("accepts a minimal Postmark payload and fills defaults", () => {
    const r = postmarkInboundSchema.safeParse({ FromFull: { Email: "a@b.co" }, MessageID: "x1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.Headers).toEqual([]);
  });

  it("rejects a payload without a sender or id", () => {
    expect(postmarkInboundSchema.safeParse({ MessageID: "x" }).success).toBe(false);
    expect(postmarkInboundSchema.safeParse({ FromFull: { Email: "a@b.co" } }).success).toBe(false);
  });

  it("reads message ids from threading headers", () => {
    expect(messageIds("<a@b.com> <c@d.com>")).toEqual(["a@b.com", "c@d.com"]);
    expect(messageIds(null)).toEqual([]);
  });
});

describe("webhook auth", () => {
  const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  it("needs the right password", () => {
    expect(authorized(basic("postmark", "s3cret-token-123456"), "s3cret-token-123456")).toBe(true);
    expect(authorized(basic("postmark", "wrong"), "s3cret-token-123456")).toBe(false);
    expect(authorized(null, "s3cret-token-123456")).toBe(false);
    expect(authorized("Bearer s3cret-token-123456", "s3cret-token-123456")).toBe(false);
    expect(authorized(basic("postmark", ""), undefined)).toBe(false);
  });
});

describe("outbound", () => {
  const email = {
    to: "jamie@example.com",
    fromName: 'Ava at "Cool" Shop',
    subject: "Re: Order help",
    text: "Hi Jamie",
    replyTo: "x+abc123.def456@inbound.postmarkapp.com",
    inReplyTo: "orig@mail.example.com",
  };
  const config = { token: "tok", from: "support@shop.com", inboundAddress: BASE };

  it("builds a threaded Postmark request", () => {
    expect(postmarkBody(email, config.from)).toEqual({
      From: '"Ava at Cool Shop" <support@shop.com>',
      To: "jamie@example.com",
      Subject: "Re: Order help",
      TextBody: "Hi Jamie",
      ReplyTo: email.replyTo,
      Headers: [
        { Name: "In-Reply-To", Value: "<orig@mail.example.com>" },
        { Name: "References", Value: "<orig@mail.example.com>" },
      ],
      MessageStream: "outbound",
    });
  });

  it("sends with the server token and reports Postmark errors", async () => {
    const good = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 0, MessageID: "pm-1" }), { status: 200 }));
    expect(await sendEmail(email, config, good)).toEqual({ ok: true, providerId: "pm-1" });
    const [, init] = good.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Postmark-Server-Token"]).toBe("tok");

    const bad = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 406, Message: "Inactive recipient" }), { status: 422 }));
    expect(await sendEmail(email, config, bad)).toEqual({ ok: false, error: "Inactive recipient" });

    const down = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await sendEmail(email, config, down)).toEqual({ ok: false, error: "Couldn't reach the email service.", transient: true });
    const busy = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 100, Message: "Maintenance" }), { status: 503 }));
    expect(await sendEmail(email, config, busy)).toEqual({ ok: false, error: "Maintenance", transient: true });
  });
});
