import { Route, Routes } from "react-router-dom";
import IconRail from "./components/IconRail.tsx";
import Placeholder from "./pages/Placeholder.tsx";
import { L } from "./labels.ts";

export default function App() {
  return (
    <div className="shell">
      <IconRail />
      <div className="main">
        <header className="topbar">
          <input className="search" type="search" placeholder={L.search.placeholder} aria-label={L.search.placeholder} disabled />
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Placeholder title={L.page.dashboardTitle} />} />
            <Route path="/leads" element={<Placeholder title={L.page.leadsTitle} />} />
            <Route path="/pipeline" element={<Placeholder title={L.page.pipelineTitle} />} />
            <Route path="/opportunities/:id" element={<Placeholder title={L.page.opportunityTitle} />} />
            <Route path="/accounts" element={<Placeholder title={L.page.accountsTitle} />} />
            <Route path="/contacts" element={<Placeholder title={L.page.contactsTitle} />} />
            <Route path="*" element={<Placeholder title={L.page.notFound} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
