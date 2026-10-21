import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  Building2, Zap, Smartphone, FileText, Users, CreditCard,
  CheckCircle, AlertTriangle, Save, Bell,
} from "lucide-react";
import { useOrganization, useUpdateOrganization, useUpdateMe, useTeam } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { Organization } from "@/contexts/AuthContext";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";

// ── Kenya counties ────────────────────────────────────────────────────────────
const COUNTIES = [
  { value: "nairobi", label: "Nairobi" },
  { value: "mombasa", label: "Mombasa" },
  { value: "kisumu", label: "Kisumu" },
  { value: "nakuru", label: "Nakuru" },
  { value: "eldoret", label: "Eldoret (Uasin Gishu)" },
  { value: "kiambu", label: "Kiambu" },
  { value: "machakos", label: "Machakos" },
  { value: "nyeri", label: "Nyeri" },
  { value: "meru", label: "Meru" },
  { value: "kisii", label: "Kisii" },
  { value: "other", label: "Other" },
];

// ── Subscription plan data ────────────────────────────────────────────────────
const PLANS = [
  {
    key: "biashara",
    name: "Biashara",
    price: "KSh 2,500",
    tagline: "For small businesses",
    features: ["5 users", "100 invoices/month", "eTIMS submission", "M-Pesa reconciliation", "14-day trial"],
  },
  {
    key: "kampuni",
    name: "Kampuni",
    price: "KSh 6,500",
    tagline: "For growing companies",
    features: ["15 users", "Unlimited invoices", "Everything in Biashara", "PAYE payroll", "Priority support"],
    popular: true,
  },
  {
    key: "shirika",
    name: "Shirika",
    price: "KSh 15,000",
    tagline: "For enterprises & NGOs",
    features: ["Unlimited users", "Everything in Kampuni", "API access", "Dedicated account manager", "SLA 99.9%"],
  },
];

// ── Reusable save form wrapper ─────────────────────────────────────────────────
function SaveBanner({ saved, error }: { saved: boolean; error?: string }) {
  if (!saved && !error) return null;
  return (
    <div
      className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
        error ? "bg-red-50 text-danger" : "bg-green-50 text-compliant"
      }`}
    >
      {error ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle className="h-4 w-4 shrink-0" />
      )}
      {error ?? "Saved successfully"}
    </div>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────
function ProfileTab({ org }: { org: Organization }) {
  const { mutateAsync: updateOrg } = useUpdateOrganization();
  const { mutateAsync: updateMe } = useUpdateMe();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const {
    register: regOrg,
    handleSubmit: handleOrg,
    formState: { isSubmitting: orgSubmitting },
  } = useForm({ defaultValues: { name: org.name, address: org.address, phone: org.phone, email: org.email, website: org.website, county: org.county } });

  const {
    register: regMe,
    handleSubmit: handleMe,
    formState: { isSubmitting: meSubmitting },
  } = useForm({ defaultValues: { first_name: user?.first_name ?? "", last_name: user?.last_name ?? "", phone_number: user?.phone_number ?? "" } });

  const onOrgSave = async (data: Record<string, string>) => {
    await updateOrg(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const onMeSave = async (data: Record<string, string>) => {
    await updateMe(data);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  return (
    <div className="space-y-8">
      {/* Business info */}
      <form onSubmit={handleOrg(onOrgSave)} className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text">Business Details</h2>
          <div className="flex items-center gap-3">
            <SaveBanner saved={saved} />
            <Button type="submit" size="sm" loading={orgSubmitting}>
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input label="Business Name" {...regOrg("name")} />
          </div>
          <Input label="Phone" placeholder="+254 20 XXX XXXX" {...regOrg("phone")} />
          <Input label="Email" type="email" placeholder="accounts@business.co.ke" {...regOrg("email")} />
          <Input label="Website" placeholder="https://business.co.ke" {...regOrg("website")} />
          <Select label="County" options={COUNTIES} {...regOrg("county")} />
          <div className="sm:col-span-2">
            <Input label="Address" placeholder="123 Moi Avenue, CBD" {...regOrg("address")} />
          </div>
        </div>

        {/* Read-only KRA PIN */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">KRA PIN</label>
          <div className="input bg-gray-50 text-muted font-mono cursor-not-allowed">
            {org.kra_pin}
          </div>
          <p className="text-xs text-muted mt-1">KRA PIN cannot be changed after registration.</p>
        </div>
      </form>

      <hr className="border-border" />

      {/* Personal profile */}
      <form onSubmit={handleMe(onMeSave)} className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text">Your Profile</h2>
          <div className="flex items-center gap-3">
            <SaveBanner saved={profileSaved} />
            <Button type="submit" size="sm" loading={meSubmitting}>
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="First Name" {...regMe("first_name")} />
          <Input label="Last Name" {...regMe("last_name")} />
          <Input label="Phone" {...regMe("phone_number")} />
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Email</label>
            <div className="input flex items-center bg-gray-50 text-muted cursor-not-allowed">
              <span className="truncate">{user?.email}</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── eTIMS tab ─────────────────────────────────────────────────────────────────
function EtimsTab({ org }: { org: Organization }) {
  const { mutateAsync: updateOrg } = useUpdateOrganization();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      vat_registration_number: org.vat_registration_number,
      etims_device_serial: org.etims_device_serial,
      etims_branch_id: org.etims_branch_id,
    },
  });

  const onSave = async (data: Record<string, string>) => {
    setError("");
    try {
      await updateOrg(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save. Please try again.");
    }
  };

  const isConfigured = !!org.etims_device_serial;

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">KRA eTIMS Configuration</h2>
        <div className="flex items-center gap-3">
          <SaveBanner saved={saved} error={error} />
          <Button type="submit" size="sm" loading={isSubmitting}>
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>

      {!isConfigured && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">eTIMS not configured</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Enter your OSCU/VSCU device serial number to enable automatic KRA submission.
              Contact your KRA eTIMS provider to obtain your credentials.
            </p>
          </div>
        </div>
      )}

      {isConfigured && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-compliant" />
          <p className="text-sm text-green-800 font-medium">eTIMS connected and active</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">KRA PIN</label>
          <div className="input bg-gray-50 text-muted font-mono cursor-not-allowed">{org.kra_pin}</div>
        </div>
        <Input
          label="VAT Registration Number"
          placeholder="e.g. 12345678V"
          {...register("vat_registration_number")}
        />
        <Input
          label="OSCU/VSCU Device Serial"
          placeholder="e.g. VSCU123456789"
          hint="Provided by your KRA-approved eTIMS vendor"
          {...register("etims_device_serial")}
        />
        <Input
          label="Branch ID"
          placeholder="00"
          hint="Default is 00 for head office"
          {...register("etims_branch_id")}
        />
      </div>

      <div className="rounded-lg bg-gray-50 border border-border p-4 text-xs text-muted space-y-1">
        <p className="font-medium text-text">How to get your eTIMS credentials</p>
        <p>1. Visit the nearest KRA iTax service centre with your ID and business documents</p>
        <p>2. Request an OSCU or VSCU device from a KRA-approved vendor (e.g. Savannah Informatics)</p>
        <p>3. Enter the device serial number provided above</p>
        <p>4. All new invoices will be automatically submitted to KRA on creation</p>
      </div>
    </form>
  );
}

// ── M-Pesa tab ────────────────────────────────────────────────────────────────
function MpesaTab({ org }: { org: Organization }) {
  const { mutateAsync: updateOrg } = useUpdateOrganization();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      mpesa_paybill_number: org.mpesa_paybill_number,
      mpesa_till_number: org.mpesa_till_number,
      mpesa_account_reference: org.mpesa_account_reference,
    },
  });

  const onSave = async (data: Record<string, string>) => {
    setError("");
    try {
      await updateOrg(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save.");
    }
  };

  const isConfigured = !!org.mpesa_paybill_number || !!org.mpesa_till_number;

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">M-Pesa Configuration</h2>
        <div className="flex items-center gap-3">
          <SaveBanner saved={saved} error={error} />
          <Button type="submit" size="sm" loading={isSubmitting}>
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>

      {!isConfigured && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">M-Pesa not configured</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Add your Safaricom paybill or till number to enable automatic payment
              reconciliation via the Daraja API webhook.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Paybill Number"
          placeholder="e.g. 522522"
          hint="Used for C2B payment reconciliation"
          {...register("mpesa_paybill_number")}
        />
        <Input
          label="Till Number (Buy Goods)"
          placeholder="e.g. 12345"
          hint="Optional — for till-based payments"
          {...register("mpesa_till_number")}
        />
        <div className="sm:col-span-2">
          <Input
            label="Account Reference Prefix"
            placeholder="e.g. INV"
            hint="Customers enter this + invoice number as the account reference"
            {...register("mpesa_account_reference")}
          />
        </div>
      </div>

      <div className="rounded-lg bg-mpesa-50 border border-mpesa-200 p-4 text-xs text-muted space-y-1">
        <p className="font-medium text-text">How M-Pesa reconciliation works</p>
        <p>1. Customer pays to your paybill using your invoice number as the account reference</p>
        <p>2. Safaricom sends a webhook to Hesabu via the Daraja API</p>
        <p>3. Hesabu auto-matches the payment to the invoice — no manual entry needed</p>
        <p>4. Unmatched payments appear on the M-Pesa Payments page for manual assignment</p>
      </div>
    </form>
  );
}

// ── Invoice settings tab ──────────────────────────────────────────────────────
function InvoiceTab({ org }: { org: Organization }) {
  const { mutateAsync: updateOrg } = useUpdateOrganization();
  const [saved, setSaved] = useState(false);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      invoice_prefix: org.invoice_prefix,
      default_payment_terms_days: String(org.default_payment_terms_days),
      default_vat_rate: String(org.default_vat_rate),
    },
  });

  const onSave = async (data: Record<string, string>) => {
    await updateOrg({
      invoice_prefix: data.invoice_prefix,
      default_payment_terms_days: parseInt(data.default_payment_terms_days) as unknown as number,
      default_vat_rate: data.default_vat_rate,
    } as Partial<Organization>);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">Invoice Settings</h2>
        <div className="flex items-center gap-3">
          <SaveBanner saved={saved} />
          <Button type="submit" size="sm" loading={isSubmitting}>
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Invoice Prefix"
          placeholder="INV"
          hint={`Generates e.g. ${org.invoice_prefix}-00001`}
          {...register("invoice_prefix")}
        />
        <Input
          label="Payment Terms (days)"
          type="number"
          min="0"
          hint="Default due date offset from invoice date"
          {...register("default_payment_terms_days")}
        />
        <Input
          label="Default VAT Rate (%)"
          type="number"
          step="0.01"
          min="0"
          hint="Standard rate is 16%"
          {...register("default_vat_rate")}
        />
      </div>
    </form>
  );
}

// ── Team tab ──────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  accountant: "Accountant",
  staff: "Staff",
};

const ROLE_VARIANTS: Record<string, "green" | "blue" | "yellow" | "gray"> = {
  owner: "green",
  admin: "blue",
  accountant: "yellow",
  staff: "gray",
};

function TeamTab() {
  const { data: members, isLoading } = useTeam();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">Team Members</h2>
        <Badge variant="gray">{members?.length ?? 0} members</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-card overflow-hidden">
          {(members ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 bg-white">
              <div>
                <p className="font-medium text-text">{m.full_name}</p>
                <p className="text-xs text-muted">{m.email}</p>
              </div>
              <Badge variant={ROLE_VARIANTS[m.role] ?? "gray"}>
                {ROLE_LABELS[m.role] ?? m.role}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-gray-50 border border-border p-4 text-xs text-muted">
        <p className="font-medium text-text mb-1">Inviting team members</p>
        <p>Team invites with role-based access control are coming in the next release.
        For now, contact support to add additional users to your account.</p>
      </div>
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────
function BillingTab({ org }: { org: Organization }) {
  const isTrial = org.subscription_status === "trial";
  const isPastDue = org.subscription_status === "past_due";

  const trialDaysLeft = org.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="space-y-6">
      {/* Current status */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-muted uppercase tracking-wide">Current Plan</p>
            <p className="text-2xl font-bold text-text capitalize mt-1">{org.subscription_tier}</p>
            <p className="text-sm text-muted mt-1">
              {PLANS.find((p) => p.key === org.subscription_tier)?.tagline}
            </p>
          </div>
          <div className="text-right">
            <Badge
              variant={
                isTrial ? "yellow" :
                isPastDue ? "red" :
                org.subscription_status === "active" ? "green" : "gray"
              }
            >
              {org.subscription_status === "trial"
                ? `Trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left`
                : org.subscription_status}
            </Badge>
            {org.trial_ends_at && isTrial && (
              <p className="text-xs text-muted mt-1">
                Expires {formatDate(org.trial_ends_at)}
              </p>
            )}
          </div>
        </div>
      </div>

      {isTrial && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              Your trial ends in {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Upgrade before your trial expires to keep access to all features.
            </p>
          </div>
        </div>
      )}

      {isPastDue && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 font-medium">
            Your subscription payment is overdue. Please update your payment method to restore full access.
          </p>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === org.subscription_tier;
          return (
            <div
              key={plan.key}
              className={`rounded-card border-2 p-5 flex flex-col ${
                plan.popular
                  ? "border-brand-500 relative"
                  : isCurrent
                  ? "border-brand-300 bg-brand-50"
                  : "border-border"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-brand-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="mb-4">
                <p className="font-bold text-text text-lg">{plan.name}</p>
                <p className="text-2xl font-bold text-brand-700 mt-1">
                  {plan.price}
                  <span className="text-sm font-normal text-muted">/mo</span>
                </p>
                <p className="text-xs text-muted mt-1">{plan.tagline}</p>
              </div>
              <ul className="space-y-1.5 flex-1 mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-text">
                    <CheckCircle className="h-3.5 w-3.5 text-compliant shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="text-center text-sm font-medium text-brand-700 py-2">
                  ✓ Current Plan
                </div>
              ) : (
                <Button
                  variant={plan.popular ? "primary" : "secondary"}
                  className="w-full"
                  onClick={() => window.open("mailto:billing@hesabu.co.ke?subject=Upgrade to " + plan.name)}
                >
                  {plan.popular ? "Upgrade Now" : "Switch Plan"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted text-center">
        All plans include a 14-day free trial. M-Pesa and card payments accepted.
        Contact <a href="mailto:billing@hesabu.co.ke" className="text-brand-700 underline">billing@hesabu.co.ke</a> for annual discounts.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "profile" | "etims" | "mpesa" | "invoice" | "team" | "billing" | "notifications";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "profile", label: "Profile", icon: Building2 },
  { key: "etims", label: "eTIMS Setup", icon: Zap },
  { key: "mpesa", label: "M-Pesa", icon: Smartphone },
  { key: "invoice", label: "Invoices", icon: FileText },
  { key: "team", label: "Team", icon: Users },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "notifications", label: "Notifications", icon: Bell },
];

const isTab = (value: string | null): value is Tab => TABS.some((t) => t.key === value);

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(requestedTab) ? requestedTab : "profile");
  const { data: org, isLoading } = useOrganization();

  // The tab bar scrolls sideways on phones; keep the active tab visible
  // (e.g. arriving on ?tab=notifications, the last tab).
  const activeTabRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab, isLoading]);

  // Follow ?tab= links (e.g. "Notification settings" in the bell panel).
  useEffect(() => {
    if (isTab(requestedTab)) setTab(requestedTab);
  }, [requestedTab]);

  // Default to eTIMS tab if not yet configured, unless a tab was asked for
  useEffect(() => {
    if (org && !org.etims_device_serial && !isTab(requestedTab)) setTab("etims");
  }, [org?.etims_device_serial]);

  if (isLoading || !org) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-100 rounded w-40" />
        <div className="h-48 bg-gray-100 rounded-card" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="page-title">Settings</h1>

      {/* Tab bar — scrollable on mobile */}
      <div className="flex gap-0.5 border-b border-border overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            ref={tab === key ? activeTabRef : undefined}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key === "etims" && !org.etims_device_serial && (
              <span className="ml-1 h-2 w-2 rounded-full bg-warning inline-block" />
            )}
            {key === "mpesa" && !org.mpesa_paybill_number && (
              <span className="ml-1 h-2 w-2 rounded-full bg-warning inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card">
        {tab === "profile" && <ProfileTab org={org} />}
        {tab === "etims" && <EtimsTab org={org} />}
        {tab === "mpesa" && <MpesaTab org={org} />}
        {tab === "invoice" && <InvoiceTab org={org} />}
        {tab === "team" && <TeamTab />}
        {tab === "billing" && <BillingTab org={org} />}
        {tab === "notifications" && <NotificationSettings />}
      </div>
    </div>
  );
}
