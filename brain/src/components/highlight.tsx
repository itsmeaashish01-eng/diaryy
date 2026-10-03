import { highlightSegments } from "@/lib/search";

/** Renders text with query words marked. Plain React text — never HTML. */
export function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {highlightSegments(text, tokens).map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-inherit">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}
