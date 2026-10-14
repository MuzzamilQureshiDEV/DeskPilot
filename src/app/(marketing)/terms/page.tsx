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
    <LegalPage title="Terms of Service" subtitle={`Last updated: ${LEGAL_EFFECTIVE_DATE}`} current="/terms">
      <section>
        <h2>1. Introduction</h2>
        <p>
          These terms are an agreement between you (the business using AstaDesk, &ldquo;you&rdquo;) and {entity}, a product of
          Websaura (&ldquo;we&rdquo;). By creating an account or using AstaDesk you agree to them. If you use AstaDesk for a company,
          you confirm you may accept these terms for it.
        </p>
      </section>

      <section>
        <h2>2. About AstaDesk</h2>
        <p>
          AstaDesk is an AI customer support service for Shopify stores. Its AI agent, Ava, reads your customers&apos; emails and
          store chat messages, answers from your store data and the policies you provide, and prepares refunds, cancellations and
          address changes for your approval. We improve the service over time, so features may change.
        </p>
      </section>

      <section>
        <h2>3. Account responsibilities</h2>
        <ul>
          <li>AstaDesk is for businesses. You must be at least 18 and able to enter a contract.</li>
          <li>Keep your login secure. You are responsible for activity under your account.</li>
          <li>Give accurate information and keep it up to date.</li>
          <li>
            You control your customers&apos; data and we process it for you as described in our <Link href="/privacy">Privacy Policy</Link>.
            You confirm you may share it with us and that your own privacy notice tells customers you use an AI-assisted support
            service.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. AI-generated responses</h2>
        <ul>
          <li>
            AI can make mistakes. You choose which topics Ava answers automatically (Autopilot) and which you review first, and you
            are responsible for replies sent from your account.
          </li>
          <li>
            Refunds, cancellations and address changes happen in Shopify only after you approve them, and you are responsible for the
            actions you approve.
          </li>
          <li>Keep your policies and store information accurate. Ava relies on them.</li>
        </ul>
      </section>

      <section>
        <h2>5. Shopify and email connections</h2>
        <p>
          AstaDesk works with services you connect, such as Shopify and your email provider, and with our own providers listed in the
          Privacy Policy. Their own terms apply to your use of them, and we are not responsible for their availability or actions.
          You can disconnect Shopify or stop forwarding email at any time.
        </p>
      </section>

      <section>
        <h2>6. Payments and plans</h2>
        <ul>
          <li>
            There is no free trial. You can create an account, explore the dashboard and test Ava on a sample store for free. AI
            replies to real customers start once you choose a paid plan.
          </li>
          <li>
            Plans are billed monthly in advance through our payment provider (PayPal or Stripe) and renew automatically until
            cancelled. Founding prices stay the same for as long as your subscription stays active.
          </li>
          <li>
            Each plan includes a number of AI replies per billing period. When they are used up, messages still arrive but AI replies
            pause until the next period or an upgrade.
          </li>
          <li>
            You can cancel anytime in Billing. Cancellation takes effect at the end of the paid period, and we don&apos;t refund
            partial periods except where the law requires.
          </li>
          <li>Prices exclude taxes. We give at least 30 days&apos; notice of price changes to an existing plan.</li>
        </ul>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You must not use AstaDesk to:</p>
        <ul>
          <li>break any law, or send spam, misleading or harmful messages;</li>
          <li>process data you have no right to process;</li>
          <li>try to access other merchants&apos; data, overload the service, reverse-engineer it or get around its security;</li>
          <li>resell the service without our written permission.</li>
        </ul>
        <p>We may suspend accounts that break these rules or put the service or other merchants at risk.</p>
      </section>

      <section>
        <h2>8. Ownership</h2>
        <p>
          You keep all rights to your data and content. We keep all rights to AstaDesk itself. You let us use your data only to
          provide and secure the service. We may use feedback you give us to improve AstaDesk.
        </p>
      </section>

      <section>
        <h2>9. Service availability</h2>
        <p>
          We work to keep AstaDesk available and reliable, but we can&apos;t promise it will never be interrupted or have errors. We
          may change or remove features. If we ever close the whole service, we will give reasonable notice and a chance to export
          your data.
        </p>
      </section>

      <section>
        <h2>10. Limitation of liability</h2>
        <p>
          As far as the law allows, AstaDesk is provided &ldquo;as is&rdquo;, without warranties, including that AI replies will
          always be accurate. Neither of us is liable for indirect losses such as lost profits or sales. Our total liability for any
          claim is limited to the fees you paid us in the 12 months before it. Nothing here limits liability that the law does not
          allow to be limited.
        </p>
      </section>

      <section>
        <h2>11. Ending the agreement</h2>
        <p>
          You can stop using AstaDesk and close your account at any time. We may suspend or end the service for a serious breach, or
          with 30 days&apos; notice for any other reason. After closing, we delete your data as described in the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>12. Governing law</h2>
        <p>
          These terms are governed by the laws of {governingLaw}, and its courts have jurisdiction, except where the law of your
          country gives you rights that an agreement can&apos;t override.
        </p>
      </section>

      <section>
        <h2>13. Changes to these terms</h2>
        <p>
          We may update these terms. For important changes we tell you by email or in the dashboard at least 14 days before they take
          effect. Continuing to use AstaDesk after that means you accept them.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          Questions about these terms: <ContactLine email={contactEmail} />.
        </p>
      </section>
    </LegalPage>
  );
}
