import type { Metadata } from "next";
import Link from "next/link";

import { ContactLine, LegalPage } from "@/components/marketing/legal-page";
import { LEGAL_EFFECTIVE_DATE, legalConfig } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Privacy Policy · AstaDesk",
  description: "How AstaDesk collects, uses and protects merchant and customer data.",
};

const PROVIDERS = [
  ["Supabase", "our database, logins and live dashboard updates"],
  ["Vercel", "hosting for the AstaDesk website and dashboard"],
  ["Anthropic", "the AI model that writes Ava's replies (it does not train on this data)"],
  ["Inngest", "running background jobs, such as processing a new message"],
  ["Postmark", "receiving forwarded support emails and sending replies"],
  ["PayPal and Stripe", "subscription payments (we never see full card numbers)"],
  ["Shopify", "the store data you choose to connect"],
];

export default function PrivacyPage() {
  const { entity, contactEmail } = legalConfig();
  return (
    <LegalPage title="Privacy Policy" subtitle={`Last updated: ${LEGAL_EFFECTIVE_DATE}`} current="/privacy">
      <section>
        <h2>Who we are</h2>
        <p>
          {entity} (&ldquo;AstaDesk&rdquo;, &ldquo;we&rdquo;) is an AI customer support service for Shopify stores, built by
          Websaura and available at <a href="https://www.astadesk.com">www.astadesk.com</a>. This policy explains what personal data
          we handle, why, and the choices you have. Questions: <ContactLine email={contactEmail} />.
        </p>
        <p>
          <strong>Merchants</strong> (stores with an AstaDesk account): for account and billing data, we decide how it&apos;s used
          (we are the &ldquo;controller&rdquo;). <strong>Shoppers</strong> (people who email or chat with a store that uses AstaDesk):
          we handle their data only on the store&apos;s instructions (as a &ldquo;processor&rdquo;), and the store&apos;s own privacy
          policy applies too.
        </p>
      </section>

      <section>
        <h2>What we collect and why</h2>
        <p>
          <strong>When you sign up as a merchant</strong>, we collect your name, email address, store name and settings, so we can
          create and run your account. Your password is stored only as a secure one-way hash.
        </p>
        <p>
          <strong>When you forward your support email</strong>, we receive the customer emails that reach that inbox, so Ava can
          read them and reply. We only see what you forward to AstaDesk, never the rest of your mailbox.
        </p>
        <p>
          <strong>When you connect Shopify</strong>, we read orders, fulfilment and tracking details, products and the customer
          details needed to answer a question (such as name, email and shipping address). Your Shopify access is encrypted.
        </p>
        <p>
          <strong>When a shopper uses your store chat</strong>, we store their messages and, if they share it, their email address.
          The chat keeps a random ID in the shopper&apos;s browser so the conversation continues across pages; we only store a
          one-way hash of it.
        </p>
        <p>
          <strong>Billing data:</strong> your plan and subscription status. Payments are handled by PayPal or Stripe.
        </p>
        <p>
          <strong>Usage data:</strong> counts such as AI replies used and conversations handled, to apply plan limits and show your
          dashboard stats, plus basic server logs to keep the service secure.
        </p>
      </section>

      <section>
        <h2>What we do not do</h2>
        <ul>
          <li>We do not sell personal data, or share it for advertising.</li>
          <li>We do not use your conversations or store data to train AI models.</li>
          <li>We do not use advertising or tracking cookies. The dashboard only uses the cookies needed to keep you signed in.</li>
          <li>We never move money or change orders in Shopify without a merchant&apos;s approval.</li>
        </ul>
      </section>

      <section>
        <h2>AI transparency</h2>
        <p>
          Replies are written by an AI model (Ava) using only the conversation, the policies the merchant adds and the store data
          needed for the question. Merchants choose which topics Ava answers automatically and which wait for review. Refunds,
          cancellations and address changes always need a person&apos;s approval. AI can make mistakes, so a person can take over any
          conversation, and the store chat is labelled as an AI assistant.
        </p>
      </section>

      <section>
        <h2>Who we share data with</h2>
        <p>Only the providers that help us run AstaDesk, under contracts that protect the data:</p>
        <ul>
          {PROVIDERS.map(([name, use]) => (
            <li key={name}>
              <strong>{name}:</strong> {use}
            </li>
          ))}
        </ul>
        <p>
          Some providers process data outside your country, including in the United States and the European Union. Where required,
          these transfers are protected by safeguards such as the EU Standard Contractual Clauses.
        </p>
      </section>

      <section>
        <h2>How long we keep data</h2>
        <ul>
          <li>Account and conversation data: while the merchant&apos;s account is active.</li>
          <li>
            When a shopper asks a store to delete their data, Shopify tells us and we delete that shopper&apos;s conversations
            automatically.
          </li>
          <li>When a store uninstalls AstaDesk, we delete its shoppers&apos; data 48 hours later unless it reconnects.</li>
          <li>
            Merchants can ask us to delete their account. We then delete their data, except what the law requires us to keep (such as
            invoices).
          </li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          Depending on where you live (for example under the GDPR, UK GDPR or California privacy laws), you can ask to access,
          correct, delete or export your personal data, and object to or restrict some processing.
        </p>
        <p>
          <strong>Shoppers:</strong> please contact the store you spoke with first. It controls your data and we will help it respond.
          <strong> Everyone else:</strong> contact us at <ContactLine email={contactEmail} />. You can also complain to your local data
          protection authority.
        </p>
      </section>

      <section>
        <h2>Lawful basis</h2>
        <p>
          Where the GDPR or UK GDPR applies, we rely on: performing our contract with merchants (running the service they signed up
          for), our legitimate interest in keeping AstaDesk secure and reliable, and legal obligations (such as keeping billing
          records).
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Data is encrypted in transit, each store&apos;s data is kept separate at the database level, and Shopify access is
          encrypted with AES-256. See our <Link href="/security">Security page</Link> for details. We will notify affected merchants of a
          breach as the law requires.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>AstaDesk is a business service and is not meant for children under 16.</p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We update this page when our practices change. For important changes, we tell merchants by email or in the dashboard.
          Questions: <ContactLine email={contactEmail} />.
        </p>
      </section>
    </LegalPage>
  );
}
