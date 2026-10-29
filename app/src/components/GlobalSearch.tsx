import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { L } from "../labels.ts";
import { getSearchService } from "../data/searchService.ts";
import { canSearch, globalSearch, type SearchKind, type SearchResult } from "../domain/search.ts";

const DEBOUNCE_MS = 300;
const PATHS: Record<SearchKind, string> = { account: "/accounts", contact: "/contacts", lead: "/leads", opportunity: "/opportunities" };

export default function GlobalSearch() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    if (!canSearch(text)) return;
    const timer = setTimeout(() => {
      setBusy(true);
      globalSearch(getSearchService(), text)
        .then((r) => mine === seq.current && setResult(r))
        .finally(() => mine === seq.current && setBusy(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const close = () => {
    seq.current++;
    setText("");
    setResult(null);
  };

  return (
    <div className="search-wrap" onKeyDown={(e) => e.key === "Escape" && close()}>
      <input
        className="search"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={L.search.placeholder}
        aria-label={L.search.placeholder}
      />
      {canSearch(text) && (
        <div className="search-results" role="region" aria-label={L.search.results}>
          {busy && !result && <p className="muted">{L.search.searching}</p>}
          {result && !busy && !result.groups.length && !result.failed.length && <p className="muted">{L.search.noMatches}</p>}
          {result?.groups.map((g) => (
            <section key={g.kind}>
              <h4>{L.entity[g.kind].plural}</h4>
              <ul>
                {g.hits.map((h) => (
                  <li key={h.id}>
                    <Link to={`${PATHS[g.kind]}/${h.id}`} onClick={close}>
                      <strong>{h.title || "—"}</strong>
                      {h.subtitle && <span className="muted"> {h.subtitle}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!!result?.failed.length && (
            <p className="muted">{L.search.failed(result.failed.map((k) => L.entity[k].plural).join(", "))}</p>
          )}
        </div>
      )}
    </div>
  );
}
