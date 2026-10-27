import { Route, Routes } from "react-router-dom";
import IconRail from "./components/IconRail.tsx";
import Placeholder from "./pages/Placeholder.tsx";
import { AccountPage, AccountsPage } from "./pages/Accounts.tsx";
import { ContactPage, ContactsPage } from "./pages/Contacts.tsx";
import { LeadPage, LeadsPage } from "./pages/Leads.tsx";
import PipelinePage from "./pages/Pipeline.tsx";
import OpportunityPage from "./pages/Opportunity.tsx";
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
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/new" element={<LeadPage />} />
            <Route path="/leads/:id" element={<LeadPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/opportunities/:id" element={<OpportunityPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/accounts/new" element={<AccountPage />} />
            <Route path="/accounts/:id" element={<AccountPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/contacts/new" element={<ContactPage />} />
            <Route path="/contacts/:id" element={<ContactPage />} />
            <Route path="*" element={<Placeholder title={L.page.notFound} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
