import { Link } from "react-router-dom";
import { L } from "../labels.ts";
import { formatMoney } from "../format.ts";
import type { Opportunity } from "../domain/pipeline.ts";

export default function OpportunityTable({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>{L.pipeline.field.name}</th>
          <th>{L.pipeline.field.account}</th>
          <th>{L.pipeline.field.contact}</th>
          <th>{L.pipeline.field.stage}</th>
          <th>{L.pipeline.field.status}</th>
          <th>{L.pipeline.field.estimatedRevenue}</th>
          <th>{L.pipeline.field.estimatedCloseDate}</th>
          <th>{L.pipeline.field.owner}</th>
        </tr>
      </thead>
      <tbody>
        {opportunities.map((o) => (
          <tr key={o.id}>
            <td><Link to={`/opportunities/${o.id}`}>{o.name}</Link></td>
            <td>{o.accountName}</td>
            <td>{o.contactName}</td>
            <td>{L.stage[o.stage]}</td>
            <td><span className={`pill ${o.status}`}>{L.opportunityStatus[o.status]}</span></td>
            <td>{formatMoney(o.estimatedRevenue)}</td>
            <td>{o.estimatedCloseDate ?? ""}</td>
            <td>{o.ownerName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
