import { useEffect, useMemo, useRef, useState } from "react";
import { L } from "../labels.ts";
import { getTimelineService } from "../data/timelineService.ts";
import {
  ACTIVITY_KINDS,
  createFeed,
  submitActivity,
  submitNote,
  type ActivityKind,
  type Feed,
  type ParentRef,
  type TimelineFilter,
  type TimelineItem,
  type TimelineTab,
} from "../domain/timeline.ts";

const FILTERS: TimelineFilter[] = ["all", "notes", "tasks", "calls", "meetings"];
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (iso: string) => new Date(iso).toLocaleString();

type ComposerTab = "note" | ActivityKind;

function Composer({ parent, onAdded }: { parent: ParentRef; onAdded: () => void }) {
  const [tab, setTab] = useState<ComposerTab>("note");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const svc = getTimelineService();
      const r = tab === "note" ? await submitNote(svc, parent, text) : await submitActivity(svc, parent, { kind: tab, subject, due, description });
      if (!r.ok) {
        setError({ text: L.timeline.textRequired, subject: L.timeline.subjectRequired, due: L.timeline.dueRequired }[r.reason]);
        return;
      }
      setText("");
      setSubject("");
      setDue("");
      setDescription("");
      onAdded();
    } catch (err) {
      console.error("Timeline add failed", err);
      setError(`${L.timeline.saveFailed}: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="tabs" role="tablist">
        {(["note", ...ACTIVITY_KINDS] as ComposerTab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {L.timeline.kind[t]}
          </button>
        ))}
      </div>
      {tab === "note" ? (
        <textarea aria-label={L.timeline.noteText} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <>
          <input aria-label={L.timeline.subject} placeholder={L.timeline.subject} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          <input aria-label={L.timeline.due} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <textarea aria-label={L.timeline.description} placeholder={L.timeline.description} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div><button className="btn primary" type="submit" disabled={busy}>{L.timeline.add}</button></div>
    </form>
  );
}

function Row({ item, planned, onChanged }: { item: TimelineItem; planned: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(item.subject);
  const [text, setText] = useState(item.text);
  const [error, setError] = useState<string>();

  async function run(work: () => Promise<void>) {
    setError(undefined);
    try {
      await work();
      onChanged();
    } catch (e) {
      console.error("Timeline update failed", e);
      setError(`${L.timeline.saveFailed}: ${errorText(e)}`);
    }
  }

  const svc = getTimelineService();
  return (
    <li>
      <div><strong>{L.timeline.kind[item.kind]}</strong>{item.subject && item.kind !== "note" ? `: ${item.subject}` : ""}</div>
      <div className="meta">{when(item.date)}{item.ownerName && ` · ${item.ownerName}`}</div>
      {editing ? (
        <div className="composer">
          {item.kind !== "note" && <input aria-label={L.timeline.subject} value={subject} onChange={(e) => setSubject(e.target.value)} />}
          <textarea aria-label={L.timeline.noteText} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="actions">
            <button className="btn small primary" onClick={() => void run(async () => { await svc.updateItem(item, { subject, text }); setEditing(false); })}>{L.timeline.save}</button>
            <button className="btn small" onClick={() => setEditing(false)}>{L.timeline.cancel}</button>
          </div>
        </div>
      ) : (
        item.text && <div>{item.text}</div>
      )}
      {error && <p className="error">{error}</p>}
      {!editing && (
        <div className="actions">
          {planned && <button className="btn small" onClick={() => void run(() => svc.markDone(item))}>{L.timeline.markDone}</button>}
          <button className="btn small" onClick={() => setEditing(true)}>{L.timeline.edit}</button>
          <button className="btn small" onClick={() => { if (window.confirm(L.timeline.confirmDelete)) void run(() => svc.deleteItem(item)); }}>{L.timeline.delete}</button>
        </div>
      )}
    </li>
  );
}

function FeedList({ parent, tab, filter, version, onChanged }: { parent: ParentRef; tab: TimelineTab; filter: TimelineFilter; version: number; onChanged: () => void }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const feed = useRef<Feed>(undefined);

  const apply = (f: Feed, page: TimelineItem[], reset: boolean) => {
    setItems((prev) => (reset ? page : [...prev, ...page]));
    setHasMore(f.hasMore);
    setError(undefined);
    setLoading(false);
  };
  const fail = (e: unknown) => {
    console.error("Timeline load failed", e);
    setError(`${L.timeline.loadFailed}: ${errorText(e)}`);
    setLoading(false);
  };

  useEffect(() => {
    let live = true;
    const f = createFeed(getTimelineService(), parent, tab, filter);
    feed.current = f;
    f.loadMore()
      .then((page) => live && apply(f, page, true))
      .catch((e) => live && fail(e));
    return () => {
      live = false;
    };
  }, [parent, tab, filter, version]);

  const loadMore = () => {
    const f = feed.current!;
    setLoading(true);
    f.loadMore().then((page) => apply(f, page, false)).catch(fail);
  };

  return (
    <>
      {error && <p className="error">{error}</p>}
      {!loading && !error && items.length === 0 && <p className="muted">{L.timeline.empty}</p>}
      <ul>{items.map((i) => <Row key={`${i.kind}-${i.id}`} item={i} planned={tab === "planned"} onChanged={onChanged} />)}</ul>
      {loading && <p className="muted">{L.customer.loading}</p>}
      {hasMore && !loading && <button className="btn" onClick={loadMore}>{L.timeline.loadMore}</button>}
    </>
  );
}

/** Planned and History lists for a Lead, Opportunity, Account or Contact, plus the Note/Task/Call/Meeting composer. */
export default function Timeline({ type, id }: ParentRef) {
  const [tab, setTab] = useState<TimelineTab>("planned");
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [version, setVersion] = useState(0);
  const parent = useMemo(() => ({ type, id }), [type, id]);
  const reload = () => setVersion((v) => v + 1);

  return (
    <section className="timeline">
      <h2>{L.timeline.title}</h2>
      <Composer parent={parent} onAdded={reload} />
      <div className="tabs">
        {(["planned", "history"] as TimelineTab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{L.timeline[t]}</button>
        ))}
      </div>
      <div className="filters" role="group" aria-label={L.timeline.title}>
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{L.timeline.filter[f]}</button>
        ))}
      </div>
      <FeedList key={`${tab}-${filter}`} parent={parent} tab={tab} filter={filter} version={version} onChanged={reload} />
    </section>
  );
}
