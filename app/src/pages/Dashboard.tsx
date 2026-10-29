import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { L } from "../labels.ts";
import { formatMoney } from "../format.ts";
import { getDashboardService } from "../data/dashboardService.ts";
import { getOpportunityService } from "../data/opportunityService.ts";
import { computeDashboard, loadDashboardData, regardingPath, type DashboardData, type DashboardScope } from "../domain/dashboard.ts";
import { useCurrentUserId } from "../components/useCurrentUserId.ts";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="muted">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const userId = useCurrentUserId();
  const [scope, setScope] = useState<DashboardScope>("me");
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedAt, setLoadedAt] = useState<Date>();

  useEffect(() => {
    let live = true;
    loadDashboardData(getDashboardService(), getOpportunityService())
      .then((d) => {
        if (!live) return;
        setData(d);
        setLoadedAt(new Date());
      })
      .catch((e) => live && setError(errorText(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const view = useMemo(() => (data ? computeDashboard(data, { scope, userId }) : undefined), [data, scope, userId]);
  const maxValue = Math.max(1, ...(view?.byStage.map((s) => s.value) ?? []));
  const k = view?.kpis;

  return (
    <section>
      <div className="list-head">
        <h1>{L.page.dashboardTitle}</h1>
        <div className="segmented" role="group" aria-label={L.dashboard.scopeHint} title={L.dashboard.scopeHint}>
          {(["me", "team"] as const).map((s) => (
            <button key={s} type="button" className={`btn${scope === s ? " primary" : ""}`} aria-pressed={scope === s} onClick={() => setScope(s)}>
              {L.dashboard[s]}
            </button>
          ))}
        </div>
        <button type="button" className="btn" disabled={loading} onClick={() => {
            setLoading(true);
            setError(undefined);
            setReloadKey((n) => n + 1);
          }}>
          {L.action.refresh}
        </button>
      </div>
      {loadedAt && <p className="muted">{L.dashboard.updated} {loadedAt.toLocaleTimeString()}</p>}
      {error && <p className="error">{L.dashboard.loadFailed}: {error}</p>}
      {loading && !view && <p className="muted">{L.dashboard.loading}</p>}
      {view && k && (
        <>
          <div className="kpis">
            <Tile label={L.dashboard.kpi.openPipelineValue} value={formatMoney(k.openPipelineValue)} />
            <Tile label={L.dashboard.kpi.openOpportunities} value={String(k.openOpportunities)} />
            <Tile label={L.dashboard.kpi.wonThisMonth} value={String(k.wonThisMonth.count)} sub={formatMoney(k.wonThisMonth.value)} />
            <Tile label={L.dashboard.kpi.lostThisMonth} value={String(k.lostThisMonth.count)} sub={formatMoney(k.lostThisMonth.value)} />
            <Tile label={L.dashboard.kpi.newLeads} value={String(k.newLeads)} />
            <Tile label={L.dashboard.kpi.overdueActivities} value={String(k.overdueActivities)} />
          </div>
          <div className="dash-panels">
            <div className="panel">
              <h3>{L.dashboard.chartTitle}</h3>
              <div className="bars">
                {view.byStage.map((s) => (
                  <div key={s.stage} className="bar-col">
                    <div className="bar-value">{formatMoney(s.value)}</div>
                    <div className="bar" style={{ height: `${(s.value / maxValue) * 100}%` }} title={`${s.count} ${L.pipeline.openCount}`} />
                    <div className="bar-label">{L.stage[s.stage]} ({s.count})</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <h3>{L.dashboard.todayTitle}</h3>
              {view.today.length === 0 && <p className="muted">{L.dashboard.noneDue}</p>}
              <ul className="today">
                {view.today.map((a) => {
                  const path = regardingPath(a);
                  return (
                    <li key={a.id}>
                      <span className={`dot${a.overdue ? " overdue" : " planned"}`} />
                      <span>{a.subject || "–"}</span>
                      {path ? <Link to={path}>{a.regardingName || path}</Link> : <span className="muted">{a.regardingName}</span>}
                      <span className="muted">{new Date(a.due).toLocaleString()}{a.overdue ? ` · ${L.dashboard.overdue}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
