import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownPreview({ text }: { text: string }) {
  return (
    <div className="markdown-content min-w-0 break-words text-sm leading-6 text-neutral-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              title={href}
              onClick={(event) => event.preventDefault()}
              className="text-indigo-700 underline"
            >
              {children}
            </a>
          ),
          // Remote images must not send document contents or tracking requests.
          img: ({ alt }) => (
            <span className="text-neutral-500">[Image: {alt || "image"}]</span>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text || "*Nothing to preview yet.*"}
      </ReactMarkdown>
    </div>
  );
}
