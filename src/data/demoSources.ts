import type { Source } from "../shared/model";

const created = Date.UTC(2026, 10, 1);
export const demoSources: Source[] = [
  {
    id: "PAY-142",
    product: "Jira",
    title: "Simplify checkout form",
    description:
      "Remove redundant billing fields and document guest checkout validation.",
    status: "In progress",
    related: ["checkout-guidelines"],
    retrievedAt: created,
  },
  {
    id: "PAY-156",
    product: "Jira",
    title: "Improve mobile payment button",
    description:
      "The checkout payment button falls below the fold on mobile. Improve visibility and touch target.",
    status: "To do",
    related: ["PAY-142", "mobile-accessibility"],
    retrievedAt: created,
  },
  {
    id: "AUTH-201",
    product: "Jira",
    title: "Implement session refresh",
    description:
      "Refresh the authentication session before a customer submits payment.",
    status: "Done",
    related: ["auth-reference"],
    retrievedAt: created,
  },
  {
    id: "MOB-118",
    product: "Jira",
    title: "Fix responsive layout",
    description:
      "Correct wrapping of checkout totals and the order summary on narrow displays.",
    status: "To do",
    related: ["PAY-156"],
    retrievedAt: created,
  },
  {
    id: "PAY-171",
    product: "Jira",
    title: "Add payment failure handling",
    description:
      "Keep customer input intact when payment fails and show actionable recovery guidance.",
    status: "To do",
    related: ["payment-architecture"],
    retrievedAt: created,
  },
  {
    id: "checkout-guidelines",
    product: "Confluence",
    title: "Checkout Design Guidelines",
    description:
      "Keep one prominent primary action. Keep guest checkout, totals and confirmation accessible at all breakpoints.",
    status: "Reference",
    related: ["PAY-142", "mobile-accessibility"],
    retrievedAt: created,
  },
  {
    id: "payment-architecture",
    product: "Confluence",
    title: "Payment Service Architecture",
    description:
      "The cart creates a payment intent. An accepted payment triggers order confirmation. Failed payments can be retried.",
    status: "Reference",
    related: ["PAY-171"],
    retrievedAt: created,
  },
  {
    id: "mobile-accessibility",
    product: "Confluence",
    title: "Mobile Accessibility Guidelines",
    description:
      "Give primary buttons an accessible touch target and keep focus visible after validation.",
    status: "Reference",
    related: ["PAY-156"],
    retrievedAt: created,
  },
  {
    id: "auth-reference",
    product: "Confluence",
    title: "Authentication API Reference",
    description:
      "Session refresh and guest session rules for first-party clients.",
    status: "Reference",
    related: ["AUTH-201"],
    retrievedAt: created,
  },
  {
    id: "billing-requirements",
    product: "Confluence",
    title: "Billing Information Requirements",
    description:
      "Collect only fields required by the payment processor and document validation errors.",
    status: "Reference",
    related: ["PAY-142"],
    retrievedAt: created,
  },
];
