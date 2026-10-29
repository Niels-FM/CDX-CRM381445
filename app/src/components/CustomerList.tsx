import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { L } from "../labels.ts";
import { loadNextPage, type ListState, type Page } from "../domain/customers.ts";

interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

interface Props<T extends { id: string }> {
  title: string;
  newLabel: string;
  newPath: string;
  fetchPage: (filterText: string, skipToken?: string) => Promise<Page<T>>;
  columns: Column<T>[];
  rowPath: (row: T) => string;
}

const DEBOUNCE_MS = 300;

export default function CustomerList<T extends { id: string }>({ title, newLabel, newPath, fetchPage, columns, rowPath }: Props<T>) {
  const [text, setText] = useState("");
  const [state, setState] = useState<ListState<T>>({ items: [], done: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | false>(false);
  const seq = useRef(0);

  const load = useCallback(
    async (filterText: string, from: ListState<T>) => {
      const mine = ++seq.current;
      setLoading(true);
      setError(false);
      try {
        const next = await loadNextPage(from, (token) => fetchPage(filterText, token));
        if (mine === seq.current) setState(next);
      } catch (e) {
        console.error("List load failed", e);
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(text, { items: [], done: false }), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, load]);

  return (
    <section>
      <div className="list-head">
        <h1>{title}</h1>
        <input
          type="search"
          className="search"
          placeholder={L.customer.filterPlaceholder}
          aria-label={L.customer.filterPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Link className="btn primary" to={newPath}>{newLabel}</Link>
      </div>
      {error !== false && <p className="error">{L.customer.loadFailed}: {error}</p>}
      <table className="grid">
        <thead>
          <tr>{columns.map((c) => <th key={c.header}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {state.items.map((row) => (
            <tr key={row.id}>
              {columns.map((c, i) => (
                <td key={c.header}>{i === 0 ? <Link to={rowPath(row)}>{c.cell(row)}</Link> : c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p className="muted">{L.customer.loading}</p>}
      {!loading && !error && state.items.length === 0 && <p className="muted">{L.customer.empty}</p>}
      {!loading && !state.done && (
        <button className="btn" onClick={() => void load(text, state)}>{L.customer.loadMore}</button>
      )}
    </section>
  );
}
