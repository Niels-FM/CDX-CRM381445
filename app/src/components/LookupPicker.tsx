import { useEffect, useState } from "react";
import { L } from "../labels.ts";

export interface LookupOption {
  id: string;
  name: string;
}

interface Props {
  label: string;
  value: LookupOption | null;
  search: (text: string) => Promise<LookupOption[]>;
  onChange: (v: LookupOption | null) => void;
  disabled?: boolean;
  required?: boolean;
}

const DEBOUNCE_MS = 300;

/** Type-to-search lookup used for the Account and Contact of an Opportunity. */
export default function LookupPicker({ label, value, search, onChange, disabled, required }: Props) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (value) return;
    let live = true;
    const t = setTimeout(() => {
      search(text.trim())
        .then((o) => {
          if (!live) return;
          setOptions(o);
          setError(undefined);
        })
        .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, value, search]);

  return (
    <div className="lookup">
      <span className="lookup-label">{label}</span>
      {value ? (
        <div className="lookup-value">
          <span>{value.name}</span>
          {!disabled && (
            <button type="button" className="btn small" onClick={() => onChange(null)}>{L.pipeline.clear}</button>
          )}
        </div>
      ) : (
        <>
          <input
            type="search"
            value={text}
            placeholder={L.pipeline.search}
            aria-label={label}
            required={required}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <p className="error">{L.customer.loadFailed}: {error}</p>}
          {!error && options.length === 0 && <p className="muted">{L.pipeline.noMatches}</p>}
          <ul className="lookup-options">
            {options.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onChange(o)}>{o.name}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
