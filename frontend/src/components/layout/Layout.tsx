import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import InvoicesPage from "@/pages/invoices/InvoicesPage";
import CreateInvoicePage from "@/pages/invoices/CreateInvoicePage";
import InvoiceDetailPage from "@/pages/invoices/InvoiceDetailPage";
import CustomersPage from "@/pages/customers/CustomersPage";
import PaymentsPage from "@/pages/payments/PaymentsPage";
import TaxReturnsPage from "@/pages/taxes/TaxReturnsPage";
import EmployeesPage from "@/pages/employees/EmployeesPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import ReportsPage from "@/pages/reports/ReportsPage";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-200
          lg:relative lg:translate-x-0 lg:flex lg:shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            {/* Invoices */}
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/invoices/new" element={<CreateInvoicePage />} />
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            {/* Customers */}
            <Route path="/customers" element={<CustomersPage />} />
            {/* Payments */}
            <Route path="/payments" element={<PaymentsPage />} />
            {/* Tax & Payroll */}
            <Route path="/taxes" element={<TaxReturnsPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
