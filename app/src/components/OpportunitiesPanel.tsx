import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { L } from "../labels.ts";
import { getCustomerService } from "../data/customerService.ts";
import type { OpportunitySummary } from "../domain/customers.ts";

/** Read-only list of the parent's Opportunities; empty until the pipeline ticket lands. */
export default function OpportunitiesPanel({ kind, id }: { kind: "account" | "contact"; id: string }) {
  const [rows, setRows] = useState<OpportunitySummary[] | null>(null);

  useEffect(() => {
    let live = true;
    getCustomerService()
      .listOpportunitiesFor({ kind, id })
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [kind, id]);

  return (
    <section className="panel">
      <h2>{L.entity.opportunity.plural}</h2>
      {rows && rows.length === 0 && <p className="muted">{L.customer.opportunitiesEmpty}</p>}
      <ul>
        {rows?.map((o) => (
          <li key={o.id}>
            <Link to={`/opportunities/${o.id}`}>{o.name}</Link> <span className="muted">{o.stage} · {o.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
