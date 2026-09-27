const { z } = require("zod");
const { id, uuid } = require("../contracts.cjs");
const provider = z.enum(["openai", "anthropic"]);
const model = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9._:-]+$/);
const target = z.object({ workspaceId: id, projectId: id, guideId: id });
const output = z
  .object({
    title: z.string().min(1).max(1000),
    description: z.string().max(20000),
    steps: z
      .array(
        z
          .object({
            captureId: uuid,
            title: z.string().min(1).max(1000),
            description: z.string().max(20000),
            needsReview: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
// Require a named slot for every selected capture. The model generates prose,
// while the adapter retains ownership of database IDs and document ordering.
function captureResponse(count) {
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new Error("Select 1-20 captures.");
  const slots = Array.from({ length: count }, (_, i) => `capture_${i + 1}`);
  const prose = z
    .object({
      title: z.string().min(1).max(1000),
      description: z.string().max(20000),
      needsReview: z.boolean(),
    })
    .strict();
  const text = { type: "string" };
  const stepSchema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "description", "needsReview"],
    properties: { title: text, description: text, needsReview: { type: "boolean" } },
  };
  return {
    slots,
    validate: z
      .object({
        title: z.string().min(1).max(1000),
        description: z.string().max(20000),
        steps: z.object(Object.fromEntries(slots.map((slot) => [slot, prose]))).strict(),
      })
      .strict(),
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "steps"],
      properties: {
        title: text,
        description: text,
        steps: {
          type: "object",
          additionalProperties: false,
          required: slots,
          properties: Object.fromEntries(slots.map((slot) => [slot, stepSchema])),
        },
      },
    },
  };
}
module.exports = {
  provider,
  model,
  target,
  output,
  captureResponse,
  key: z.object({
    provider,
    key: z
      .string()
      .trim()
      .min(10)
      .max(1000)
      .regex(/^[\x21-\x7e]+$/),
  }),
  defaults: z.object({ workspaceId: id, provider, model }),
  generate: target.extend({ captureIds: z.array(uuid).min(1).max(20), provider, model }),
  refine: target.extend({
    provider,
    model,
    instruction: z.string().trim().min(1).max(4000),
  }),
  draft: z.object({ workspaceId: id, draftId: uuid }),
};
