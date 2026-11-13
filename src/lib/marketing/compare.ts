// Comparison pages (/compare and /compare/[slug]).
//
// Rules for this file: describe competitors only by things their own public
// pages state, never quote their prices (they change; we link to the official
// pricing page instead), and say plainly when the other product is the better
// choice. Re-check the facts whenever COMPARE_CHECKED changes.

export const COMPARE_CHECKED = "November 2026";

export type CompareRow = { topic: string; astadesk: string; them: string };

export type Competitor = {
  slug: string;
  name: string;
  /** One line: what the other product is. */
  summary: string;
  pricingUrl: string;
  /** Short answer shown at the top and used as the meta description (max 160 characters). */
  verdict: string;
  rows: CompareRow[];
  chooseAstaDesk: string[];
  chooseThem: string[];
  faq: { q: string; a: string }[];
};

const ASTADESK = {
  built: "Shopify stores only. Ava, the AI agent, is the product; the inbox exists so you can check and take over her work.",
  channels: "2 channels in 1 inbox: your forwarded support email and a chat widget on your storefront.",
  money:
    "The AI cannot refund, cancel or change an address. It prepares the action and a person approves each one, on every plan. There is no setting that turns this off.",
  data: "Reads live Shopify orders, tracking and products, and only discusses an order when the customer's email matches it.",
  limit: "When the month's AI replies are used up, Ava stops and new messages wait in the inbox. No overage charges.",
  setup: "About 10 minutes in 3 steps: connect Shopify, forward your email, add your policies.",
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "gorgias",
    name: "Gorgias",
    summary: "Gorgias is a helpdesk for ecommerce brands, with an AI agent offered on top of it.",
    pricingUrl: "https://www.gorgias.com/pricing",
    verdict:
      "AstaDesk is a flat-priced AI support agent for small Shopify stores. Gorgias is a full ecommerce helpdesk for support teams that need many channels.",
    rows: [
      { topic: "Built for", astadesk: ASTADESK.built, them: "Ecommerce support teams. A full helpdesk with ticketing, macros, rules and reporting, plus an AI agent." },
      { topic: "Channels", astadesk: ASTADESK.channels, them: "Email, live chat, social media, SMS and voice, depending on the plan and add-ons." },
      {
        topic: "How pricing works",
        astadesk: "A flat monthly plan that includes a set number of AI replies. Not priced per agent seat or per ticket.",
        them: "Plans are sized by billable tickets per month, and AI-automated interactions are billed in addition to the helpdesk plan.",
      },
      { topic: "At the monthly limit", astadesk: ASTADESK.limit, them: "Tickets beyond the plan's allowance are charged as overage." },
      { topic: "Refunds and cancellations", astadesk: ASTADESK.money, them: "The AI agent can be set up to take actions in Shopify. What it may do is configured by the merchant." },
      { topic: "Store platforms", astadesk: "Shopify.", them: "Shopify, plus other ecommerce platforms such as BigCommerce and Adobe Commerce." },
      { topic: "Setup", astadesk: ASTADESK.setup, them: "A helpdesk rollout: channels, rules, macros and team seats to configure." },
    ],
    chooseAstaDesk: [
      "You run a small Shopify store and answer support yourself or with 1 or 2 people.",
      "You want one predictable monthly price with no per-ticket or per-resolution bill.",
      "You want a hard guarantee that the AI never moves money without your approval.",
    ],
    chooseThem: [
      "You have a support team that needs a full helpdesk with macros, rules and reporting.",
      "You support customers on social media, SMS or phone, which AstaDesk does not cover.",
      "Your store is not on Shopify.",
    ],
    faq: [
      {
        q: "Is AstaDesk a Gorgias alternative?",
        a: "Yes, for small Shopify stores that mainly want routine questions answered by AI. AstaDesk covers email and storefront chat with one flat monthly price. It is not a replacement for Gorgias if you need social media, SMS or voice support, or a helpdesk for a larger team.",
      },
      {
        q: "How is AstaDesk pricing different from Gorgias?",
        a: "AstaDesk plans are a flat monthly price with a set number of AI replies included, and Ava simply stops at the limit. Gorgias sizes its plans by billable tickets per month and bills AI-automated interactions in addition. Check each pricing page for current figures.",
      },
      {
        q: "Can I switch from Gorgias to AstaDesk?",
        a: "Yes. AstaDesk does not import old tickets. You connect your Shopify store, forward your support email to AstaDesk and add your policies, which takes about 10 minutes, then turn off forwarding to your previous tool.",
      },
    ],
  },
  {
    slug: "zendesk",
    name: "Zendesk",
    summary: "Zendesk is a general-purpose customer service platform used by companies of every size and industry.",
    pricingUrl: "https://www.zendesk.com/pricing/",
    verdict:
      "AstaDesk is a ready-made AI support agent for Shopify stores. Zendesk is a broad customer service platform for teams in any industry, priced per agent.",
    rows: [
      { topic: "Built for", astadesk: ASTADESK.built, them: "Support teams in any industry. A broad platform: ticketing, help centre, messaging, voice, reporting and a large app marketplace." },
      { topic: "Channels", astadesk: ASTADESK.channels, them: "Email, messaging and live chat, social channels, voice and a help centre, depending on the plan." },
      {
        topic: "How pricing works",
        astadesk: "A flat monthly plan that includes a set number of AI replies. Not priced per agent seat.",
        them: "Priced per agent seat per month, with AI agents measured by automated resolutions.",
      },
      { topic: "Shopify data", astadesk: ASTADESK.data, them: "Through a Shopify integration from its marketplace, which you install and configure." },
      { topic: "Refunds and cancellations", astadesk: ASTADESK.money, them: "Depends on the integrations and workflows you build." },
      { topic: "Setup", astadesk: ASTADESK.setup, them: "A configurable platform. Most teams plan an implementation, and larger ones use an admin or partner." },
      { topic: "At the monthly limit", astadesk: ASTADESK.limit, them: "Automated resolutions beyond the included allowance are billed." },
    ],
    chooseAstaDesk: [
      "You run a Shopify store and want order, shipping and product questions answered without building anything.",
      "You are a founder or a team of 1 to 3, and per-seat software is more than you need.",
      "You want refunds, cancellations and address changes to always wait for your approval.",
    ],
    chooseThem: [
      "You have a larger support team that needs roles, SLAs, routing and detailed reporting.",
      "You need phone support, a public help centre or many integrations.",
      "Your business is not a Shopify store.",
    ],
    faq: [
      {
        q: "Is AstaDesk a Zendesk alternative for Shopify stores?",
        a: "Yes, for small Shopify stores. AstaDesk answers routine email and chat questions from live Shopify data with a flat monthly price. Zendesk is the better fit for larger teams that need a full service platform across many channels.",
      },
      {
        q: "Does AstaDesk charge per agent like Zendesk?",
        a: "No. AstaDesk plans are a flat monthly price with a set number of AI replies included. Zendesk is priced per agent seat per month.",
      },
      {
        q: "Does AstaDesk have a help centre or phone support like Zendesk?",
        a: "No. AstaDesk covers 2 channels, support email and storefront chat. If you need a public help centre or voice support, Zendesk covers those.",
      },
    ],
  },
  {
    slug: "tidio",
    name: "Tidio",
    summary: "Tidio is a live chat and chatbot tool for websites, with an AI agent called Lyro.",
    pricingUrl: "https://www.tidio.com/pricing/",
    verdict:
      "AstaDesk answers Shopify support email and chat from live order data, with approval on every refund. Tidio is a live chat and chatbot tool with a free plan.",
    rows: [
      { topic: "Built for", astadesk: ASTADESK.built, them: "Small and mid-sized websites that want live chat, chatbot flows and an AI agent (Lyro)." },
      { topic: "Channels", astadesk: ASTADESK.channels, them: "Website live chat first, plus email, Messenger, Instagram and WhatsApp, depending on the plan." },
      {
        topic: "How pricing works",
        astadesk: "A flat monthly plan that includes a set number of AI replies.",
        them: "Plans are sized by billable conversations, and Lyro AI conversations are a separate quota on most plans.",
      },
      { topic: "Free plan", astadesk: "No free plan or trial. You can explore the dashboard and test Ava on a sample store before paying.", them: "Yes, a free plan with limits." },
      { topic: "Shopify data", astadesk: ASTADESK.data, them: "A Shopify integration; which order actions are available depends on the plan." },
      { topic: "Refunds and cancellations", astadesk: ASTADESK.money, them: "Depends on the plan and the flows you set up." },
      { topic: "Website platforms", astadesk: "Shopify.", them: "Shopify, WordPress, Wix and most other website platforms." },
    ],
    chooseAstaDesk: [
      "Most of your support arrives by email, not only by chat.",
      "You want answers taken from live Shopify orders and tracking, with identity checked before an order is discussed.",
      "You want every refund, cancellation and address change to wait for your approval.",
    ],
    chooseThem: [
      "You want a free plan to start with.",
      "Your site is not on Shopify, or you want Messenger, Instagram or WhatsApp in the same inbox.",
      "You want to build your own chatbot flows for sales and lead capture.",
    ],
    faq: [
      {
        q: "Is AstaDesk a Tidio alternative for Shopify?",
        a: "Yes, if your goal is to have AI answer support questions by email and storefront chat using live Shopify order data. Tidio is the better fit if you want a free plan, a non-Shopify site or social messaging channels.",
      },
      {
        q: "Does AstaDesk have a free plan like Tidio?",
        a: "No. AstaDesk has no free plan or free trial. You can create an account, connect your store and test Ava on a sample store for free, then choose a paid plan when you want her to reply to real customers.",
      },
      {
        q: "Does AstaDesk answer emails as well as chat?",
        a: "Yes. You forward your existing support address to AstaDesk, and Ava answers emails and storefront chats in 1 inbox.",
      },
    ],
  },
];

export function competitorBySlug(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
