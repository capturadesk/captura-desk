import { useState } from "react";
import type { AIDraft } from "@/lib/desktop";
import type { Guide } from "@/lib/workspace";

// Bound the comparison work for long AI responses. Common prefix/suffix remain
// readable; the changed passage is marked on both sides without altering text.
function ChangedText({
  text,
  other,
  side,
}: {
  text: string;
  other: string;
  side: "before" | "after";
}) {
  if (text === other) return <span>{text || "(empty)"}</span>;
  const a = text.match(/\s+|[^\s]+/gu) || [];
  const b = other.match(/\s+|[^\s]+/gu) || [];
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const changed = a.slice(start, a.length - end).join("");
  return (
    <>
      {a.slice(0, start).join("")}
      {changed &&
        (side === "before" ? (
          <del className="rounded bg-red-100 text-red-900 decoration-red-500">
            {changed}
          </del>
        ) : (
          <ins className="rounded bg-emerald-100 text-emerald-900 underline decoration-emerald-600">
            {changed}
          </ins>
        ))}
      {end ? a.slice(-end).join("") : ""}
      {!text && <span className="italic text-neutral-400">(empty)</span>}
    </>
  );
}
function Field({ name, before, after }: { name: string; before: string; after: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        {name}
        {before === after ? " (unchanged)" : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="whitespace-pre-wrap break-words rounded bg-neutral-50 p-2">
          <ChangedText text={before} other={after} side="before" />
        </p>
        <p className="whitespace-pre-wrap break-words rounded bg-neutral-50 p-2">
          <ChangedText text={after} other={before} side="after" />
        </p>
      </div>
    </div>
  );
}
export function RevisionComparison({ guide, draft }: { guide: Guide; draft: AIDraft }) {
  const [onlyChanges, setOnlyChanges] = useState(false);
  if (draft.output.format === "document")
    return (
      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer text-sm font-medium">
          Compare with current document
        </summary>
        <section aria-label="Revision comparison" className="mt-4 space-y-4">
          <p>
            Sections may be combined, split or reordered. Compare the complete document
            below; source references remain attached to each proposed section.
          </p>
          <div className="grid grid-cols-2 gap-3 font-medium">
            <p>Current document</p>
            <p>Proposed document</p>
          </div>
          <Field name="Document title" before={guide.title} after={draft.output.title} />
          <Field
            name="Summary"
            before={guide.description}
            after={draft.output.description}
          />
          <Field
            name="Sections"
            before={guide.steps.map((s) => s.title + "\n" + s.description).join("\n\n")}
            after={draft.output.steps
              .map(
                (s) =>
                  s.title +
                  "\n" +
                  (s.needsReview ? "Review needed: " : "") +
                  s.description,
              )
              .join("\n\n")}
          />
        </section>
      </details>
    );
  const rows = guide.steps.map((step, index) => {
    const proposed = draft.output.steps.find((s) => s.captureId === step.captureId);
    const description = proposed
      ? (proposed.needsReview ? "Review needed: " : "") + proposed.description
      : "";
    return {
      step,
      index,
      proposed,
      description,
      changed:
        !proposed || step.title !== proposed.title || step.description !== description,
    };
  });
  const changed = rows.filter((row) => row.proposed && row.changed).length;
  const excluded = rows.filter((row) => !row.proposed).length;
  return (
    <details className="rounded-md border p-3 text-xs">
      <summary className="cursor-pointer text-sm font-medium">
        Compare with current document
      </summary>
      <section aria-label="Revision comparison" className="mt-4 space-y-4">
        <p>
          {changed} changed steps · {excluded} excluded steps ·{" "}
          {rows.length - changed - excluded} unchanged steps
        </p>
        <p className="text-neutral-500">
          Removed passages are struck through; proposed passages are underlined. Unchanged
          words at the beginning and end remain unmarked. Excluded steps stay in the
          current document but will not appear in the new one.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={(e) => setOnlyChanges(e.target.checked)}
          />
          Show only changes
        </label>
        <div className="grid grid-cols-2 gap-3 font-medium">
          <p>Current document</p>
          <p>Proposed document</p>
        </div>
        {(!onlyChanges || guide.title !== draft.output.title) && (
          <Field name="Document title" before={guide.title} after={draft.output.title} />
        )}
        {(!onlyChanges || guide.description !== draft.output.description) && (
          <Field
            name="Summary"
            before={guide.description}
            after={draft.output.description}
          />
        )}
        {rows
          .filter((row) => !onlyChanges || row.changed)
          .map(({ step, index, proposed, description, changed }) => (
            <div key={step.id} className="space-y-3 border-t pt-3">
              <h4 className="font-medium">
                Step {index + 1} ·{" "}
                {!proposed ? "Excluded" : changed ? "Changed" : "Unchanged"}
              </h4>
              {proposed ? (
                <>
                  <Field name="Step title" before={step.title} after={proposed.title} />
                  <Field
                    name="Instructions"
                    before={step.description}
                    after={description}
                  />
                </>
              ) : (
                <p className="whitespace-pre-wrap text-neutral-500">
                  {step.title}
                  <br />
                  Not included in this draft. Its original screenshot is retained.
                </p>
              )}
            </div>
          ))}
        {onlyChanges &&
          !rows.some((row) => row.changed) &&
          guide.title === draft.output.title &&
          guide.description === draft.output.description && <p>No text changes.</p>}
      </section>
    </details>
  );
}
