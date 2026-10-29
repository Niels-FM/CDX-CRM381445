import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { L } from "../labels.ts";
import { formatMoney } from "../format.ts";
import { getOpportunityService } from "../data/opportunityService.ts";
import OpportunityForm from "../components/OpportunityForm.tsx";
import Timeline from "../components/Timeline.tsx";
import { ConfirmWonDialog, LostReasonDialog } from "../components/CloseDialogs.tsx";
import {
  STAGES,
  closeLost,
  closeWon,
  isClosed,
  moveToStage,
  reopenOpportunity,
  todayIso,
  type Opportunity,
  type Stage,
} from "../domain/pipeline.ts";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function StageStepper({ current, disabled, onPick }: { current: Stage; disabled: boolean; onPick: (s: Stage) => void }) {
  const at = STAGES.indexOf(current);
  return (
    <div className="chev" role="group" aria-label={L.pipeline.stageStepper}>
      {STAGES.map((s, i) => (
        <button key={s} type="button" disabled={disabled} className={i <= at ? "done" : ""} aria-current={i === at ? "step" : undefined} onClick={() => onPick(s)}>
          {L.stage[s]}
        </button>
      ))}
    </div>
  );
}

export default function OpportunityPage() {
  const { id } = useParams();
  const [opp, setOpp] = useState<Opportunity>();
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [dialog, setDialog] = useState<"won" | "lost">();

  useEffect(() => {
    if (!id) return;
    let live = true;
    getOpportunityService()
      .getOpportunity(id)
      .then((o) => live && setOpp(o))
      .catch((e) => {
        console.error("Opportunity load failed", e);
        if (live) setLoadError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [id]);

  async function run(action: () => Promise<{ ok: boolean; record?: Opportunity }>, failure: string) {
    setActionError(undefined);
    try {
      const r = await action();
      if (r.ok && r.record) setOpp(r.record);
    } catch (e) {
      console.error(failure, e);
      setActionError(`${failure}: ${errorText(e)}`);
    }
  }

  if (loadError) return <p className="error">{L.customer.loadFailed}: {loadError}</p>;
  if (!opp) return <p className="muted">{L.customer.loading}</p>;

  const svc = getOpportunityService();
  const closed = isClosed(opp);

  return (
    <div className="deal-page">
      <aside className="summary panel">
        <h2>{opp.name}</h2>
        <h3>{L.pipeline.summary}</h3>
        <div className="f"><span>{L.pipeline.field.estimatedRevenue}</span><b>{formatMoney(opp.estimatedRevenue)}</b></div>
        <div className="f"><span>{L.pipeline.field.probability}</span><b>{opp.probability ?? "–"}</b></div>
        <div className="f"><span>{L.pipeline.field.estimatedCloseDate}</span><b>{opp.estimatedCloseDate ?? "–"}</b></div>
        <div className="f"><span>{L.pipeline.field.status}</span><b>{L.opportunityStatus[opp.status]}</b></div>
        {opp.closedDate && <div className="f"><span>{L.pipeline.closedOn}</span><b>{opp.closedDate}</b></div>}
        {opp.lostReason && <div className="f"><span>{L.pipeline.lostReason}</span><b>{opp.lostReason}</b></div>}
        <div className="f"><span>{L.pipeline.field.owner}</span><b>{opp.ownerName || "–"}</b></div>
        <div className="f"><span>{L.pipeline.field.contact}</span><b>{opp.contactId ? <Link to={`/contacts/${opp.contactId}`}>{opp.contactName}</Link> : "–"}</b></div>
        <div className="f"><span>{L.pipeline.field.account}</span><b><Link to={`/accounts/${opp.accountId}`}>{opp.accountName}</Link></b></div>
      </aside>
      <div className="deal-main">
        <div className="row">
          <h1>{L.page.opportunityTitle}</h1>
          <div className="actions">
            {!closed && <button className="btn won" onClick={() => setDialog("won")}>{L.action.won}</button>}
            {!closed && <button className="btn lost" onClick={() => setDialog("lost")}>{L.action.lost}</button>}
            {closed && <button className="btn" onClick={() => void run(() => reopenOpportunity(svc, opp), L.pipeline.reopenFailed)}>{L.pipeline.reopen}</button>}
          </div>
        </div>
        <StageStepper
          current={opp.stage}
          disabled={closed}
          onPick={(s) => void run(() => moveToStage(svc, opp, s), L.pipeline.updateFailed)}
        />
        {closed && <p className="muted">{L.pipeline.closedReadOnly}</p>}
        {actionError && <p className="error">{actionError}</p>}
        <OpportunityForm key={`${opp.id}-${opp.status}-${opp.stage}-${opp.probability}`} original={opp} disabled={closed} onSaved={setOpp} />
        <Timeline type="nvdb_opportunity" id={opp.id} />
      </div>
      {dialog === "won" && (
        <ConfirmWonDialog
          onCancel={() => setDialog(undefined)}
          onConfirm={() => {
            setDialog(undefined);
            void run(() => closeWon(svc, opp, todayIso()), L.pipeline.updateFailed);
          }}
        />
      )}
      {dialog === "lost" && (
        <LostReasonDialog
          onCancel={() => setDialog(undefined)}
          onConfirm={(reason) => {
            setDialog(undefined);
            void run(() => closeLost(svc, opp, reason, todayIso()), L.pipeline.updateFailed);
          }}
        />
      )}
    </div>
  );
}
