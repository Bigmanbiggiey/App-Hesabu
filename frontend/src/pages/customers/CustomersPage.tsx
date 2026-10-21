import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Building2, Pencil, Trash2 } from "lucide-react";
import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from "@/hooks/useCustomers";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import type { Customer } from "@/lib/types";

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  name: z.string().min(1, "Required"),
  kra_pin: z.string().optional().default(""),
  is_wht_agent: z.boolean().default(false),
  email: z.string().email("Invalid email").optional().or(z.literal("")).default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});
type FormData = z.infer<typeof schema>;

// ── Customer Form (shared by create + edit) ───────────────────────────────────
function CustomerForm({
  defaultValues,
  onSubmit,
  submitting,
  onCancel,
}: {
  defaultValues: FormData;
  onSubmit: (data: FormData) => Promise<void>;
  submitting: boolean;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Name"
        placeholder="Safaricom PLC"
        error={errors.name?.message}
        {...register("name")}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="KRA PIN"
          placeholder="P000000000X"
          error={errors.kra_pin?.message}
          {...register("kra_pin")}
        />
        <Input
          label="Phone"
          placeholder="+254 7XX XXX XXX"
          {...register("phone")}
        />
      </div>
      <Input
        label="Email"
        type="email"
        placeholder="accounts@company.co.ke"
        error={errors.email?.message}
        {...register("email")}
      />
      <Input label="Address" placeholder="Nairobi, Kenya" {...register("address")} />
      <Textarea label="Notes" placeholder="Internal notes…" {...register("notes")} />
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="rounded" {...register("is_wht_agent")} />
        WHT agent (deducts Withholding Tax)
      </label>
      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={submitting} className="flex-1">
          Save Customer
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);

  const { data, isLoading } = useCustomers({ page: String(page), page_size: "25" });
  const { mutateAsync: createCustomer } = useCreateCustomer();
  const { mutateAsync: updateCustomer } = useUpdateCustomer();
  const { mutateAsync: deleteCustomer, isPending: isDeleting } = useDeleteCustomer();

  const customers = data?.results ?? [];

  const filtered = search
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.kra_pin.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase())
      )
    : customers;

  const blankForm: FormData = {
    name: "",
    kra_pin: "",
    is_wht_agent: false,
    email: "",
    phone: "",
    address: "",
    notes: "",
  };

  const handleCreate = async (data: FormData) => {
    await createCustomer({
      name: data.name,
      kra_pin: data.kra_pin ?? "",
      is_wht_agent: data.is_wht_agent,
      email: data.email ?? "",
      phone: data.phone ?? "",
      address: data.address ?? "",
      notes: data.notes ?? "",
    });
    setShowCreate(false);
  };

  const handleEdit = async (data: FormData) => {
    if (!editing) return;
    await updateCustomer({
      id: editing.id,
      data: {
        name: data.name,
        kra_pin: data.kra_pin ?? "",
        is_wht_agent: data.is_wht_agent,
        email: data.email ?? "",
        phone: data.phone ?? "",
        address: data.address ?? "",
        notes: data.notes ?? "",
      },
    });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteCustomer(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
        <input
          className="input pl-9"
          placeholder="Search by name, PIN, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3.5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-32" />
                <div className="h-4 bg-gray-100 rounded flex-1" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No customers yet"
            description="Add your first customer to start creating invoices."
            action={{ label: "Add Customer", onClick: () => setShowCreate(true) }}
          />
        ) : (
          <>
            <div className="table-wrapper border-0 rounded-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>KRA PIN</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>WHT</th>
                    <th>Added</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Name" className="font-medium">{c.name}</td>
                      <td data-label="KRA PIN" className="font-mono text-xs text-muted">{c.kra_pin || "—"}</td>
                      <td data-label="Email" className="text-sm text-muted">{c.email || "—"}</td>
                      <td data-label="Phone" className="text-sm text-muted">{c.phone || "—"}</td>
                      <td data-label="WHT">
                        {c.is_wht_agent ? (
                          <Badge variant="yellow">WHT</Badge>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td data-label="Added" className="text-xs text-muted">{formatDate(c.created_at)}</td>
                      <td className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <button
                            onClick={() => setEditing(c)}
                            className="p-1.5 rounded-lg text-muted hover:text-brand-700 hover:bg-brand-50"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(c)}
                            className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {(data?.count ?? 0) > 25 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted">{data?.count} customers total</p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!data?.previous}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!data?.next}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Customer"
        size="md"
      >
        <CustomerForm
          defaultValues={blankForm}
          onSubmit={handleCreate}
          submitting={false}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Customer"
        size="md"
      >
        {editing && (
          <CustomerForm
            defaultValues={{
              name: editing.name,
              kra_pin: editing.kra_pin,
              is_wht_agent: editing.is_wht_agent,
              email: editing.email,
              phone: editing.phone,
              address: editing.address,
              notes: editing.notes,
            }}
            onSubmit={handleEdit}
            submitting={false}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Customer"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text">
            Delete <span className="font-semibold">{confirmDelete?.name}</span>? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              loading={isDeleting}
              onClick={handleDelete}
              className="flex-1"
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
