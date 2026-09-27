import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ModelPicker({
  models,
  value,
  disabled,
  onSelect,
  onClose,
}: {
  models: string[];
  value: string;
  disabled: boolean;
  onSelect: (model: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const options = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const filtered = models.filter((model) =>
    model.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section
      data-model-picker
      aria-label="Available models"
      className="min-w-0 rounded-md border bg-white"
    >
      <div className="flex items-center gap-2 border-b p-2">
        <Input
          ref={search}
          aria-label="Search models"
          placeholder="Search models..."
          autoFocus
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (options.current) options.current.scrollTop = 0;
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              options.current?.querySelector("button")?.focus();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onClose}
        >
          Hide
        </Button>
      </div>
      <p role="status" className="px-3 py-2 text-[10px] text-neutral-500">
        {filtered.length} of {models.length} models
      </p>
      <ul
        ref={options}
        aria-label="Model results"
        className="max-h-48 overflow-y-auto overscroll-contain px-1 pb-1"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
            return;
          }
          const buttons = Array.from(options.current?.querySelectorAll("button") ?? []);
          const index = buttons.indexOf(e.target as HTMLButtonElement);
          if (index < 0) return;
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            if (e.key === "ArrowUp" && index === 0) {
              search.current?.focus();
              return;
            }
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        buttons.length - 1,
                        index + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    );
            buttons[next]?.focus();
          }
        }}
      >
        {filtered.map((model) => (
          <li key={model}>
            <button
              type="button"
              aria-pressed={value === model}
              disabled={disabled}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none disabled:opacity-50"
              onClick={() => onSelect(model)}
            >
              <span className="min-w-0 flex-1 break-all">{model}</span>
              {value === model && (
                <Check aria-hidden="true" className="size-3.5 shrink-0" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {!filtered.length && (
        <p className="px-3 pb-3 text-xs text-neutral-500">
          No matching models. Try another search or enter a model ID above.
        </p>
      )}
    </section>
  );
}
