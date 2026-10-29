import { useEffect, useState } from "react";
import { L } from "../labels.ts";
import { formatMoney } from "../format.ts";
import { getOpportunityService } from "../data/opportunityService.ts";
import { getTimelineService } from "../data/timelineService.ts";
import { buildDotMap, loadOpenActivities, type Dot } from "../domain/timeline.ts";
import PipelineBoard from "../components/PipelineBoard.tsx";
import OpportunityTable from "../components/OpportunityTable.tsx";
import OpportunityForm from "../components/OpportunityForm.tsx";
import { ConfirmWonDialog, LostReasonDialog, Modal } from "../components/CloseDialogs.tsx";
import {
  closeLost,
  closeWon,
  dropOpportunity,
  filterOpportunities,
  loadAllPages,
  moveToStage,
  openPipelineTotals,
  todayIso,
  type DropTarget,
  type Opportunity,
  type Stage,
  type Status,
} from "../domain/pipeline.ts";

type View = "pipeline" | "list";
type Pending = { kind: "won" | "lost"; opp: Opportunity };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function PipelinePage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [view, setView] = useState<View>("pipeline");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [creating, setCreating] = useState<Stage>();
  const [pending, setPending] = useState<Pending>();

  const [reloadKey, setReloadKey] = useState(0);
  const [dots, setDots] = useState<Map<string, Dot>>();

  useEffect(() => {
    let live = true;
    loadOpenActivities(getTimelineService())
      .then((open) => live && setDots(buildDotMap(open)))
      .catch((e) => console.error("Next-activity dots failed", e));
    return () => {
      live = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let live = true;
    loadAllPages((skipToken) => getOpportunityService().listOpportunities({ skipToken }))
      .then((all) => {
        if (!live) return;
        setOpps(all);
        setError(undefined);
      })
      .catch((e) => {
        console.error("Pipeline load failed", e);
        if (live) setError(errorText(e));
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const refresh = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const replace = (o: Opportunity) => setOpps((all) => all.map((x) => (x.id === o.id ? o : x)));

  async function run(action: () => Promise<{ ok: boolean; record?: Opportunity }>) {
    setActionError(undefined);
    try {
      const r = await action();
      if (r.ok && r.record) replace(r.record);
    } catch (e) {
      console.error("Update failed", e);
      setActionError(`${L.pipeline.updateFailed}: ${errorText(e)}`);
    }
  }

  function handleDrop(id: string, target: DropTarget) {
    const opp = opps.find((o) => o.id === id);
    if (!opp) return;
    const plan = dropOpportunity(opp, target);
    if (plan.kind === "move") void run(() => moveToStage(getOpportunityService(), opp, plan.stage));
    else if (plan.kind === "confirmWon") setPending({ kind: "won", opp });
    else if (plan.kind === "askLostReason") setPending({ kind: "lost", opp });
  }

  const totals = openPipelineTotals(opps);
  const listed = filterOpportunities(opps, text).filter((o) => status === "all" || o.status === status);

  return (
    <section>
      <div className="subbar">
        <h1>{L.page.pipelineTitle}</h1>
        <div className="toggle" role="group" aria-label={L.page.pipelineTitle}>
          <button className={view === "pipeline" ? "on" : ""} onClick={() => setView("pipeline")}>{L.pipeline.viewPipeline}</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>{L.pipeline.viewList}</button>
        </div>
        <button className="btn primary" onClick={() => setCreating("qualify")}>+ {L.pipeline.newOpportunity}</button>
        <button className="btn" onClick={refresh}>{L.action.refresh}</button>
        <span className="sum">{L.pipeline.totalValue}: <b>{formatMoney(totals.total)}</b> · <b>{totals.count}</b> {L.pipeline.openCount}</span>
      </div>
      {view === "list" && (
        <div className="list-head">
          <input type="search" className="search" placeholder={L.customer.filterPlaceholder} aria-label={L.customer.filterPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
          <select aria-label={L.pipeline.field.status} value={status} onChange={(e) => setStatus(e.target.value as Status | "all")}>
            <option value="all">{L.pipeline.allStatuses}</option>
            <option value="open">{L.opportunityStatus.open}</option>
            <option value="won">{L.opportunityStatus.won}</option>
            <option value="lost">{L.opportunityStatus.lost}</option>
          </select>
        </div>
      )}
      {error && <p className="error">{L.customer.loadFailed}: {error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {loading && <p className="muted">{L.customer.loading}</p>}
      {!loading && view === "pipeline" && <PipelineBoard opportunities={opps} dots={dots} onDrop={handleDrop} onAdd={setCreating} />}
      {!loading && view === "list" && (listed.length ? <OpportunityTable opportunities={listed} /> : !error && <p className="muted">{L.customer.empty}</p>)}

      {creating && (
        <Modal title={L.pipeline.newOpportunity} footer={null}>
          <OpportunityForm
            stage={creating}
            onCancel={() => setCreating(undefined)}
            onSaved={(o) => {
              setOpps((all) => [o, ...all]);
              setCreating(undefined);
            }}
          />
        </Modal>
      )}
      {pending?.kind === "won" && (
        <ConfirmWonDialog
          onCancel={() => setPending(undefined)}
          onConfirm={() => {
            const { opp } = pending;
            setPending(undefined);
            void run(() => closeWon(getOpportunityService(), opp, todayIso()));
          }}
        />
      )}
      {pending?.kind === "lost" && (
        <LostReasonDialog
          onCancel={() => setPending(undefined)}
          onConfirm={(reason) => {
            const { opp } = pending;
            setPending(undefined);
            void run(() => closeLost(getOpportunityService(), opp, reason, todayIso()));
          }}
        />
      )}
    </section>
  );
}
