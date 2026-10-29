import { useState } from "react";
import { Link } from "react-router-dom";
import { L } from "../labels.ts";
import { formatMoney } from "../format.ts";
import { buildPipeline, type DropTarget, type Opportunity, type Stage } from "../domain/pipeline.ts";
import type { Dot } from "../domain/timeline.ts";

interface Props {
  opportunities: Opportunity[];
  dots?: Map<string, Dot>;
  onDrop: (id: string, target: DropTarget) => void;
  onAdd: (stage: Stage) => void;
}

const DRAG_TYPE = "text/opportunity-id";

/** Kanban: chevron Stage headers, draggable cards, add per column and Won/Lost drop zones while dragging. */
export default function PipelineBoard({ opportunities, dots, onDrop, onAdd }: Props) {
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<string>();

  const zone = (key: string, target: DropTarget) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? undefined : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DRAG_TYPE);
      setOver(undefined);
      setDragging(false);
      if (id) onDrop(id, target);
    },
  });

  return (
    <div className="board">
      <div className="columns">
        {buildPipeline(opportunities).map((col) => (
          <div key={col.stage} className={over === col.stage ? "stage over" : "stage"} {...zone(col.stage, { kind: "stage", stage: col.stage })}>
            <div className="shead">
              <h4>{L.stage[col.stage]}</h4>
              <div className="m">{formatMoney(col.total)} · {col.count}</div>
            </div>
            <div className="cards">
              {col.items.map((o) => (
                <div
                  key={o.id}
                  className="deal"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, o.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(true);
                  }}
                  onDragEnd={() => {
                    setDragging(false);
                    setOver(undefined);
                  }}
                >
                  <Link to={`/opportunities/${o.id}`} draggable={false}><strong>{o.name}</strong></Link>
                  <div className="org">{o.accountName}</div>
                  {o.contactName && <div className="org">{o.contactName}</div>}
                  <div className="foot">
                    <span className={`dot ${dots?.get(o.id) ?? "none"}`} title={L.timeline.dot[dots?.get(o.id) ?? "none"]} />
                    {formatMoney(o.estimatedRevenue)}
                  </div>
                </div>
              ))}
            </div>
            <button className="add" onClick={() => onAdd(col.stage)}>+ {L.pipeline.addToStage}</button>
          </div>
        ))}
      </div>
      {dragging && (
        <div className="drop-zones">
          <div className={over === "won" ? "zone won over" : "zone won"} {...zone("won", { kind: "won" })}>{L.pipeline.dropWon}</div>
          <div className={over === "lost" ? "zone lost over" : "zone lost"} {...zone("lost", { kind: "lost" })}>{L.pipeline.dropLost}</div>
        </div>
      )}
    </div>
  );
}
