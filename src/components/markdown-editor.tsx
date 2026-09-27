import { useLayoutEffect, useRef, useState } from "react";
import { Textarea } from "./ui/textarea";
import { MarkdownPreview } from "./markdown-preview";

export function MarkdownEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!editing || !input.current) return;
    input.current.focus();
    input.current.style.height = "auto";
    input.current.style.height = `${input.current.scrollHeight}px`;
  }, [editing, value]);

  return (
    <section aria-label={`${label} editor`} className="my-3 min-w-0">
      <Textarea
        ref={input}
        hidden={!editing}
        style={editing ? undefined : { display: "none" }}
        aria-label={label}
        value={value}
        maxLength={20000}
        placeholder="Write a description using Markdown..."
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
        className="min-h-12 resize-y overflow-hidden border-0 px-1 py-1 font-mono text-sm leading-6 shadow-none focus-visible:ring-1 focus-visible:ring-neutral-200"
      />
      {!editing && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Edit ${label.toLowerCase()}`}
          title="Click to edit Markdown"
          onFocus={() => setEditing(true)}
          onClick={() => setEditing(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setEditing(true);
            }
          }}
          className="min-h-12 cursor-text rounded-sm px-1 py-1"
        >
          {value.trim() ? (
            <MarkdownPreview text={value} />
          ) : (
            <span className="text-sm leading-6 text-neutral-400">
              Click to add a description...
            </span>
          )}
        </div>
      )}
    </section>
  );
}
