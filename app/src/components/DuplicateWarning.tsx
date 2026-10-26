import { Link } from "react-router-dom";
import { L } from "../labels.ts";

interface Props {
  message: string;
  matches: { id: string; label: string; path: string }[];
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function DuplicateWarning({ message, matches, confirmLabel, onConfirm, onDismiss }: Props) {
  return (
    <div className="warning" role="alert">
      <strong>{L.customer.duplicateTitle}</strong>
      <p>{message}</p>
      <ul>
        {matches.map((m) => (
          <li key={m.id}>
            {m.label} — <Link to={m.path}>{L.customer.open}</Link>
          </li>
        ))}
      </ul>
      <button className="btn primary" onClick={onConfirm}>{confirmLabel}</button>{" "}
      <button className="btn" onClick={onDismiss}>{L.customer.cancel}</button>
    </div>
  );
}
