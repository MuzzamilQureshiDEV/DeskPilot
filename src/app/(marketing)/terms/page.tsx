import type { Metadata } from "next";
import Link from "next/link";

import { ContactLine, LegalPage } from "@/components/marketing/legal-page";
import { LEGAL_EFFECTIVE_DATE, legalConfig } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Terms of Service · AstaDesk",
  description: "The terms that apply to using AstaDesk.",
};

export default function TermsPage() {
  const { entity, contactEmail, governingLaw } = legalConfig();
  return (
    <LegalPage
      title="Terms of Service"
      effective={LEGAL_EFFECTIVE_DATE}
      intro={
        <p>
          These terms are an agreement between you (the business using AstaDesk, &ldquo;you&rdquo;) and {entity} (&ldquo;we&rdquo;).
          By creating an account or using AstaDesk you agree to them. If you use AstaDesk for a company, you confirm you may
          accept these terms for it.
        </p>
      }
    >
      <section>
        <h2>1. The service</h2>
        <p>
          AstaDesk is an AI customer support tool for Shopify stores. It receives your customers&apos; emails and store chat
          messages, drafts or sends replies using your store data and the policies you provide, and proposes actions such as
          refunds, cancellations and address changes for your approval. Features may change as we improve the service.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>AstaDesk is for businesses. You must be at least 18 and able to enter a contract.</li>
          <li>Keep your login secure. You are responsible for activity under your account and for your team members.</li>
          <li>Give accurate information and keep it up to date.</li>
        </ul>
      </section>

      <section>
        <h2>3. AI replies and your responsibility</h2>
        <ul>
          <li>
            AI can make mistakes. You decide which replies are sent automatically (Autopilot) and which you review first, and you
            are responsible for replies sent from your account.
          </li>
          <li>
            Refunds, cancellations and address changes are carried out in Shopify only after you approve them. You are
            responsible for the actions you approve.
          </li>
          <li>Keep your policies and store information accurate. The agent relies on them.</li>
        </ul>
      </section>

      <section>
        <h2>4. Your customers&apos; data</h2>
        <p>
          You control the data of your customers who contact you through AstaDesk, and we process it on your behalf as described
          in our <Link href="/privacy">Privacy Policy</Link>. You confirm you have the right to share it with us and that your
          own privacy notice tells customers you use an AI-assisted support service.
        </p>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>You must not use AstaDesk to:</p>
        <ul>
          <li>break any law, or send spam, misleading or harmful messages;</li>
          <li>process data you have no right to process;</li>
          <li>try to access other merchants&apos; data, overload, reverse-engineer or bypass the security of the service;</li>
          <li>resell the service without our written permission.</li>
        </ul>
        <p>We may suspend accounts that break these rules or put the service or other merchants at risk.</p>
      </section>

      <section>
        <h2>6. Trial, plans and payment</h2>
        <ul>
          <li>New accounts get a 14-day free trial with no card. When it ends, AI replies pause until you choose a plan.</li>
          <li>Paid plans are billed monthly in advance through Stripe and renew automatically until cancelled.</li>
          <li>Each plan includes a number of AI replies per billing period. When it&apos;s used up, messages still arrive but AI replies pause until the next period or an upgrade.</li>
          <li>
            You can cancel anytime in Billing. Cancellation takes effect at the end of the paid period, and we don&apos;t refund
            partial periods except where the law requires.
          </li>
          <li>Prices exclude taxes. We will give at least 30 days&apos; notice of price changes to an existing plan.</li>
        </ul>
      </section>

      <section>
        <h2>7. Third-party services</h2>
        <p>
          AstaDesk connects to services such as Shopify, Stripe and email providers. Their own terms apply to your use of them,
          and we are not responsible for their availability or actions.
        </p>
      </section>

      <section>
        <h2>8. Ownership</h2>
        <p>
          You keep all rights to your data and content. We keep all rights to AstaDesk itself. You give us permission to use
          your data only to provide and secure the service. Feedback you give us may be used to improve AstaDesk.
        </p>
      </section>

      <section>
        <h2>9. Availability and changes</h2>
        <p>
          We work to keep AstaDesk available and reliable, but we don&apos;t guarantee it will be uninterrupted or error-free.
          We may change or discontinue features. If we discontinue the whole service, we will give reasonable notice and a
          chance to export your data.
        </p>
      </section>

      <section>
        <h2>10. Disclaimers and liability</h2>
        <p>
          To the extent the law allows, AstaDesk is provided &ldquo;as is&rdquo;, without warranties of any kind, including
          that AI replies will be accurate or suitable. Neither party is liable for indirect or consequential losses, such as lost
          profits or sales. Our total liability for any claim is limited to the fees you paid us in the 12 months before the
          claim. Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </section>

      <section>
        <h2>11. Termination</h2>
        <p>
          You can stop using AstaDesk and close your account at any time. We may end these terms or suspend the service for a
          serious breach, or with 30 days&apos; notice for any other reason. After closing, we delete your data as described in
          the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>12. Governing law</h2>
        <p>
          These terms are governed by the laws of {governingLaw}, and its courts have jurisdiction, except where the law of your
          country gives you rights that cannot be overridden by agreement.
        </p>
      </section>

      <section>
        <h2>13. Changes and contact</h2>
        <p>
          We may update these terms. For material changes we will notify you by email or in the dashboard at least 14 days before
          they take effect. Continuing to use AstaDesk after that means you accept them. Questions:{" "}
          <ContactLine email={contactEmail} />.
        </p>
      </section>
    </LegalPage>
  );
}
