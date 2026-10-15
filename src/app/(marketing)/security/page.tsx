import type { Metadata } from "next";
import Link from "next/link";

import { ContactLine, LegalPage } from "@/components/marketing/legal-page";
import { legalConfig } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Security · AstaDesk",
  description: "How AstaDesk protects your store, your inbox and your customers' data.",
};

const SERVICES = [
  ["Supabase", "Postgres database and logins, data encrypted at rest"],
  ["Vercel", "hosting, served over HTTPS"],
  ["Anthropic", "the AI model behind Ava; it doesn't train on API data"],
  ["Inngest", "background jobs, called only with signed requests"],
  ["Postmark", "receiving forwarded emails and sending replies"],
  ["PayPal and Stripe", "payments; card details never reach AstaDesk"],
  ["Shopify", "store data, through the official Admin API (with the store's own app credentials, encrypted like tokens)"],
];

export default function SecurityPage() {
  const { contactEmail } = legalConfig();
  return (
    <LegalPage
      title="Security"
      subtitle="How we protect your store and your customers"
      current="/security"
      intro={
        <p>
          AstaDesk handles sensitive things: access to your Shopify store, your support emails and your customers&apos; order
          details. This page describes the protections that are actually in place today. We&apos;re a small team and don&apos;t hold
          formal certifications such as SOC 2 or ISO 27001 yet.
        </p>
      }
    >
      <section>
        <h2>Encryption</h2>
        <p>
          Your Shopify access tokens are encrypted with <strong>AES-256-GCM</strong> before they&apos;re stored, and the key is kept
          separately from the database. Our database provider encrypts all stored data at rest, and every connection between your
          browser, the dashboard, the storefront chat and our servers uses <strong>HTTPS</strong>.
        </p>
      </section>

      <section>
        <h2>Authentication</h2>
        <p>
          Logins use Supabase Auth. Passwords are never stored in plain text: they&apos;re hashed with <strong>bcrypt</strong>, a
          one-way algorithm built to resist guessing. New accounts confirm their email address, and password resets use a single-use
          link sent to that address.
        </p>
      </section>

      <section>
        <h2>Store isolation</h2>
        <p>
          Every store&apos;s data lives behind <strong>row-level security</strong> in the database: each request can only read and
          change rows belonging to the signed-in member&apos;s own store. We test this with automated checks that try to read and
          change another store&apos;s data and confirm it&apos;s refused. Background jobs filter every query by store as well.
        </p>
      </section>

      <section>
        <h2>You approve every money action</h2>
        <p>
          Ava can only <strong>propose</strong> refunds, cancellations and address changes. Nothing changes in Shopify until a member
          of your store approves it, and we record who approved each action and when. Settings that would let money move
          automatically don&apos;t exist, in the dashboard or in the database.
        </p>
      </section>

      <section>
        <h2>Verified connections</h2>
        <p>
          Every request that reaches AstaDesk from outside is checked before anything is done with it: Shopify webhooks and storefront
          chat requests by their <strong>HMAC signatures</strong>, payment events by PayPal&apos;s or Stripe&apos;s signature checks,
          forwarded emails by a secret token, and background jobs by signed requests. Repeated deliveries are recognised, so nothing
          runs twice.
        </p>
      </section>

      <section>
        <h2>Rate limits and loop protection</h2>
        <ul>
          <li>Store chat: up to 10 messages per visitor every 10 minutes, and 60 new chats per store per hour.</li>
          <li>Email: auto-replies, mailing lists and automatic notifications are recognised and never answered, and a sender writing too often is paused.</li>
          <li>Ava sends at most a few automatic email replies in a row in one conversation before handing it to you (you choose the number).</li>
        </ul>
      </section>

      <section>
        <h2>Audit trail</h2>
        <p>
          AstaDesk keeps a record of the things that matter: who approved or rejected each action and the result in Shopify, every
          payment event, privacy requests from Shopify, and the emails that were skipped and why (visible in Settings).
        </p>
      </section>

      <section>
        <h2>Data handling</h2>
        <ul>
          <li>Ava only sees what&apos;s needed for the question: the conversation, your policies and the relevant store data.</li>
          <li>Chat shoppers must give both their order number and checkout email before Ava discusses an order.</li>
          <li>Your data is never used to train AI models, and never sold.</li>
          <li>
            Shopify privacy requests are handled automatically: customer data is deleted on request, and a store&apos;s customer data
            is deleted 48 hours after it uninstalls AstaDesk. Stores connected with their own private app send us these requests by email. Details are in our <Link href="/privacy">Privacy Policy</Link>.
          </li>
        </ul>
      </section>

      <section>
        <h2>Third-party services we use</h2>
        <ul>
          {SERVICES.map(([name, use]) => (
            <li key={name}>
              <strong>{name}:</strong> {use}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Reporting a concern</h2>
        <p>
          If you think you&apos;ve found a security problem, please email <ContactLine email={contactEmail} /> with the details. We
          read every report, reply as soon as we can, and ask that you give us a reasonable chance to fix it before sharing it
          publicly.
        </p>
      </section>
    </LegalPage>
  );
}
