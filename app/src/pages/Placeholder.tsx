import { L } from "../labels.ts";

export default function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="muted">{L.page.comingSoon}</p>
    </section>
  );
}
