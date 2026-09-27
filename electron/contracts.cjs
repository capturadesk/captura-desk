const { z } = require("zod");
const id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
const uuid = z.uuid();
const step = z.object({
  id,
  title: z.string().max(1000),
  description: z.string().max(20000),
  screen: z.string().max(500),
  captureId: uuid.optional(),
  captureIds: z.array(uuid).min(1).max(200).optional(),
  capturedAt: z.number().optional(),
  elapsedMs: z.number().optional(),
});
const guide = z.object({
  id,
  title: z.string().max(1000),
  description: z.string().max(20000),
  steps: z.array(step).max(5000),
  demo: z.boolean(),
  sessionId: uuid.optional(),
  format: z.literal("document").optional(),
  recovered: z.boolean().optional(),
  revision: z.number().int().nonnegative().optional(),
  revisionLabel: z.string().trim().min(1).max(120).optional(),
  createdAt: z.number().optional(),
  basedOnRevision: z.number().int().nonnegative().optional(),
});
const project = z.object({
  id,
  name: z.string().min(1).max(120),
  description: z.string().max(20000),
  instructions: z.string().max(20000),
  documents: z.array(guide).max(2000),
});
const workspace = z
  .array(project)
  .max(1000)
  .superRefine((projects, ctx) => {
    if (new Set(projects.map((p) => p.id)).size !== projects.length)
      ctx.addIssue({ code: "custom", message: "Duplicate project IDs" });
    for (const p of projects)
      if (new Set(p.documents.map((d) => d.id)).size !== p.documents.length)
        ctx.addIssue({ code: "custom", message: "Duplicate document IDs" });
  });
module.exports = {
  id,
  uuid,
  workspace,
  workspaceSave: z.object({ workspaceId: id, projects: workspace }),
  workspaceName: z.string().trim().min(1).max(80),
  renameWorkspace: z.object({ id, name: z.string().trim().min(1).max(80) }),
  deleteProject: z.object({ workspaceId: id, projectId: id }),
  deleteRecording: z.object({ workspaceId: id, projectId: id, guideId: id }),
  startRecording: z.object({
    projectId: id,
    name: z.string().trim().min(1).max(120),
    context: z.string().max(20000),
    displayId: z.string().min(1).max(40),
  }),
  exportRequest: z.object({ projectId: id, guideId: id }),
  annotationSave: z.object({
    id: uuid,
    frame: z.enum(["before", "after"]),
    boxes: z
      .array(
        z
          .object({
            kind: z.enum(["highlight", "redact"]),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            width: z.number().positive().max(1),
            height: z.number().positive().max(1),
          })
          .refine((b) => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001),
      )
      .max(100),
  }),
  captureRequest: z.object({ id: uuid, frame: z.enum(["before", "after"]) }),
};
