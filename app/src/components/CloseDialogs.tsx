import { useState, type ReactNode } from "react";
import { L } from "../labels.ts";

export function Modal({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card">
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function ConfirmWonDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      title={L.pipeline.confirmWon}
      footer={
        <>
          <button className="btn" onClick={onCancel}>{L.customer.cancel}</button>
          <button className="btn primary" onClick={onConfirm}>{L.action.won}</button>
        </>
      }
    >
      <p className="muted">{L.pipeline.closedReadOnly}</p>
    </Modal>
  );
}

export function LostReasonDialog({ onConfirm, onCancel }: { onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const missing = !reason.trim();
  return (
    <Modal
      title={L.pipeline.lostReasonPrompt}
      footer={
        <>
          <button className="btn" onClick={onCancel}>{L.customer.cancel}</button>
          <button
            className="btn lost"
            onClick={() => {
              setTouched(true);
              if (!missing) onConfirm(reason);
            }}
          >
            {L.action.lost}
          </button>
        </>
      }
    >
      <label className="form">
        {L.pipeline.lostReason}
        <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </label>
      {touched && missing && <p className="error">{L.pipeline.lostReasonRequired}</p>}
    </Modal>
  );
}
