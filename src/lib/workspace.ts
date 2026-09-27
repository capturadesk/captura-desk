export type Step = {
  id: string;
  title: string;
  description: string;
  screen: string;
  captureId?: string;
  capturedAt?: number;
  elapsedMs?: number;
};
export type Guide = {
  id: string;
  title: string;
  description: string;
  steps: Step[];
  demo: boolean;
  sessionId?: string;
  recovered?: boolean;
  revision?: number;
  revisionLabel?: string;
  createdAt?: number;
  basedOnRevision?: number;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  documents: Guide[];
};
export const defaultInstructions =
  "Write clear, numbered procedures for the operations team. Include prerequisites and a final verification. Keep the language concise and flag anything unclear instead of guessing.";
export function sampleSteps(): Step[] {
  return [
    [
      "Open the payments dashboard",
      "Select Payments in the sidebar to view recent transactions.",
      "Payments",
    ],
    [
      "Find the failed transaction",
      "Select the Failed tab, then open the payment you want to investigate.",
      "Failed payments",
    ],
    [
      "Review the payment details",
      "Review the recorded failure reason and the payment amount.",
      "Payment details",
    ],
    [
      "Check the customer information",
      "Open the customer profile and verify the billing information.",
      "Customer information",
    ],
    [
      "Retry the payment",
      "After the issue is resolved, select Retry payment.",
      "Retry payment",
    ],
    [
      "Verify the final status",
      "Confirm the payment shows Succeeded. If it fails again, record the error for follow-up.",
      "Payment status",
    ],
  ].map(([title, description, screen], i) => ({
    id: `step-${i}`,
    title,
    description,
    screen,
  }));
}
export const initialProjects: Project[] = [
  {
    id: "operations",
    name: "Operations playbook",
    description: "The everyday processes that keep things moving.",
    instructions: defaultInstructions,
    documents: [
      {
        id: "payments",
        title: "Resolve a failed payment",
        description:
          "Find the failed transaction, investigate the issue, and verify that the payment is successfully processed.",
        steps: sampleSteps(),
        demo: true,
      },
    ],
  },
  {
    id: "onboarding",
    name: "Customer onboarding",
    description: "Help new customers find their feet.",
    instructions:
      "Write friendly step-by-step tutorials for new customers. Explain unfamiliar terms and include screenshots.",
    documents: [],
  },
  {
    id: "product",
    name: "Product walkthroughs",
    description: "Make every feature easy to understand.",
    instructions:
      "Create concise feature walkthroughs with numbered steps and a short summary.",
    documents: [],
  },
];
export function markdown(guide: Guide) {
  return `# ${guide.title}\n\n${guide.description}\n\n${guide.steps.map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.description}`).join("\n\n")}${guide.demo ? "\n\n---\nSample workflow from the Captura Desk UI preview. Screens are illustrative." : ""}\n`;
}
export function readWorkspace(): Project[] {
  try {
    const value = JSON.parse(localStorage.getItem("capturadesk-desktop-v1") || "null");
    if (
      Array.isArray(value) &&
      value.length &&
      value.every(
        (p) =>
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.description === "string" &&
          typeof p.instructions === "string" &&
          Array.isArray(p.documents) &&
          p.documents.every(
            (d: Guide) =>
              typeof d.id === "string" &&
              typeof d.title === "string" &&
              typeof d.description === "string" &&
              Array.isArray(d.steps) &&
              d.steps.every(
                (s) =>
                  typeof s.id === "string" &&
                  typeof s.title === "string" &&
                  typeof s.description === "string" &&
                  typeof s.screen === "string",
              ),
          ),
      )
    )
      return value;
  } catch {
    /* Start with the sample workspace if saved data is unreadable. */
  }
  return structuredClone(initialProjects);
}
