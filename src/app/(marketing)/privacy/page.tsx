import type { Metadata } from "next";

import { ContactLine, LegalPage } from "@/components/marketing/legal-page";
import { LEGAL_EFFECTIVE_DATE, legalConfig } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Privacy Policy · AstaDesk",
  description: "How AstaDesk collects, uses and protects merchant and customer data.",
};

const PROVIDERS = [
  ["Supabase", "Database, authentication and real-time updates"],
  ["Vercel", "Application hosting"],
  ["Anthropic", "AI model that drafts replies (data is not used to train its models)"],
  ["Inngest", "Background job processing"],
  ["Postmark", "Receiving and sending support email"],
  ["Stripe", "Subscription billing and payments (AstaDesk never sees full card numbers)"],
  ["Shopify", "Store data you connect (orders, products, customers)"],
  ["Sentry", "Error monitoring, with personal data removed before reports are sent"],
];

export default function PrivacyPage() {
  const { entity, contactEmail } = legalConfig();
  return (
    <LegalPage
      title="Privacy Policy"
      effective={LEGAL_EFFECTIVE_DATE}
      intro={
        <p>
          This policy explains what personal data {entity} (&ldquo;AstaDesk&rdquo;, &ldquo;we&rdquo;) handles when merchants use
          our AI customer support service and when their customers contact them through it, why we handle it, and the choices
          and rights you have.
        </p>
      }
    >
      <section>
        <h2>1. Who this policy covers and our role</h2>
        <ul>
          <li>
            <strong>Merchants</strong> (our customers who create a AstaDesk account). For their account and billing data, we
            decide how the data is used (we are the &ldquo;controller&rdquo;).
          </li>
          <li>
            <strong>Shoppers</strong> (the merchant&apos;s customers who email or chat with a store that uses AstaDesk). For this
            data we act only on the merchant&apos;s instructions, as a &ldquo;processor&rdquo; or &ldquo;service provider&rdquo;. The
            merchant&apos;s own privacy policy also applies, and shoppers can contact the store directly about their data.
          </li>
        </ul>
      </section>

      <section>
        <h2>2. Data we collect</h2>
        <ul>
          <li>
            <strong>Account data:</strong> name, email address, password (stored only as a secure hash), store name and settings.
          </li>
          <li>
            <strong>Connected store data:</strong> when a merchant connects Shopify, we read orders, fulfilment and tracking
            details, products and customer details needed to answer support questions. Access tokens are encrypted.
          </li>
          <li>
            <strong>Support conversations:</strong> emails forwarded to AstaDesk and messages sent through the store chat,
            including the sender&apos;s name and email if provided, plus replies, drafts and internal notes.
          </li>
          <li>
            <strong>Billing data:</strong> plan, subscription status and invoices, handled by Stripe. We do not store card numbers.
          </li>
          <li>
            <strong>Usage and technical data:</strong> counts of AI replies, error reports (with personal data removed) and basic
            server logs.
          </li>
        </ul>
        <p>
          The store chat keeps a random identifier in the shopper&apos;s browser storage so the conversation continues across
          pages. We only store a one-way hash of it. We do not use advertising or tracking cookies. Our dashboard uses only the
          cookies needed to keep you signed in.
        </p>
      </section>

      <section>
        <h2>3. How we use data</h2>
        <ul>
          <li>To provide the service: receive messages, look up store data, draft and send replies, and show them in the inbox.</li>
          <li>To carry out actions a merchant explicitly approves (for example a refund or cancellation in Shopify).</li>
          <li>To bill subscriptions, prevent abuse (for example rate limits and email loop protection) and keep the service secure.</li>
          <li>To fix errors and improve reliability.</li>
          <li>To communicate with merchants about their account and important changes.</li>
        </ul>
        <p>
          We do not sell personal data, and we do not use support conversations to train AI models. Legal bases (where GDPR or
          UK GDPR applies): performance of our contract with merchants, our legitimate interests in running a secure service, and
          legal obligations.
        </p>
      </section>

      <section>
        <h2>4. AI processing</h2>
        <p>
          Replies are drafted by an AI model using only the conversation, the merchant&apos;s policies and the store data needed
          for the question. Merchants choose whether replies are sent automatically or reviewed first. Refunds, cancellations and
          address changes are never carried out without a merchant&apos;s approval. AI output can be wrong, which is why
          conversations can always be taken over by a person.
        </p>
      </section>

      <section>
        <h2>5. Service providers</h2>
        <p>We share data only with providers that help us run AstaDesk, under contracts that protect it:</p>
        <ul>
          {PROVIDERS.map(([name, use]) => (
            <li key={name}>
              <strong>{name}:</strong> {use}
            </li>
          ))}
        </ul>
        <p>
          Some providers process data outside your country, including in the United States and the European Union. Where
          required, transfers are protected by safeguards such as the EU Standard Contractual Clauses.
        </p>
      </section>

      <section>
        <h2>6. Retention and deletion</h2>
        <ul>
          <li>We keep account and conversation data while the merchant&apos;s account is active.</li>
          <li>
            When a shopper asks a store to delete their data, Shopify notifies us and we delete that shopper&apos;s conversations
            automatically. When a store uninstalls AstaDesk, we delete its shoppers&apos; data 48 hours later unless the store
            reconnects.
          </li>
          <li>Merchants can ask us to delete their whole account. We then delete their data, except what we must keep by law (for example invoices).</li>
        </ul>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>
          Data is encrypted in transit. Each store&apos;s data is isolated at the database level, Shopify access tokens are
          encrypted with AES-256, every incoming webhook is verified, and access to production systems is restricted. No system
          is perfectly secure, but we work to protect your data and will notify affected merchants of a breach as required by law.
        </p>
      </section>

      <section>
        <h2>8. Your rights</h2>
        <p>
          Depending on where you live (for example under the GDPR, UK GDPR or California privacy laws), you may have the right to
          access, correct, delete or export your personal data, and to object to or restrict certain processing. We do not sell
          or share personal data for cross-context advertising.
        </p>
        <p>
          Shoppers: please contact the store you spoke with first. It controls your data and we will help it respond. Merchants
          and anyone else: contact us at <ContactLine email={contactEmail} />. You may also complain to your local data protection
          authority.
        </p>
      </section>

      <section>
        <h2>9. Children</h2>
        <p>AstaDesk is a business service and is not directed at children under 16.</p>
      </section>

      <section>
        <h2>10. Changes and contact</h2>
        <p>
          We will update this page when our practices change and, for material changes, notify merchants by email or in the
          dashboard. Questions: <ContactLine email={contactEmail} />.
        </p>
      </section>
    </LegalPage>
  );
}
