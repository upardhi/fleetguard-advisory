"use client";

/**
 * ServiceProviderDrawer — shared, role-aware drawer for creating / editing /
 * reviewing / approving service providers.
 *
 * Permission model (see AGENTS brief):
 *   wh_manager        → can CREATE; provider goes to "pending"; cannot approve/delete
 *   regional_manager  → can REVIEW + APPROVE; cannot permanently delete; can edit fields
 *   cso               → can view / edit / approve own-company providers; can deactivate
 *   company_admin     → full CRUD, auto-approves on create
 *   super_admin       → same as company_admin
 *
 * NOTE: Reject and Delete actions have been moved to the table on the list page.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { SlidePanel, Field, inputCls, textareaCls } from "./SlidePanel";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { fmtDate } from "../_lib/utils";
import type { FgWarehouse } from "../_services/warehouseService";
import type { FgUser } from "../_services/userService";
import type {
  FgServiceProvider,
  ServiceProviderStatus,
  ServiceProviderType,
} from "../_services/serviceProviderService";
import {
  approveServiceProvider,
  createServiceProvider,
  rejectServiceProvider,
  reviewServiceProvider,
  updateServiceProvider,
} from "../_services/serviceProviderService";

export const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu & Kashmir",
  "Ladakh",
  "Puducherry",
];

const SP_TYPES: { value: ServiceProviderType; label: string }[] = [
  { value: "transport", label: "Transport / Logistics" },
  { value: "fuel", label: "Fuel Supplier" },
  { value: "maintenance", label: "Maintenance" },
  { value: "loading", label: "Loading / Unloading" },
  { value: "security", label: "Security Agency" },
  { value: "other", label: "Other" },
];

const STATUS_TONE: Record<ServiceProviderStatus, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  reviewed: "info",
  approved: "success",
  rejected: "danger",
};

const STATUS_LABEL: Record<ServiceProviderStatus, string> = {
  pending: "Pending approval",
  reviewed: "Reviewed — awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
};

// ── Role capability matrix ────────────────────────────────────────────────────
export interface SpPermissions {
  canCreate: boolean;
  canEditFields: boolean;
  canReview: boolean; // pending → reviewed
  canApprove: boolean; // pending/reviewed → approved
  canReject: boolean; // used by table actions only
  canDeactivate: boolean; // sets isActive=false (soft disable)
  canDelete: boolean; // permanent deletion — used by table actions only
  autoApproveOnCreate: boolean;
}

export function getSpPermissions(user: FgUser | null): SpPermissions {
  const role = user?.role ?? "guard";
  switch (role) {
    case "super_admin":
      return {
        canCreate: true,
        canEditFields: true,
        canReview: true,
        canApprove: true,
        canReject: true,
        canDeactivate: true,
        canDelete: true,
        autoApproveOnCreate: true,
      };
    case "company_admin":
      return {
        canCreate: true,
        canEditFields: true,
        canReview: true,
        canApprove: true,
        canReject: true,
        canDeactivate: true,
        canDelete: true,
        autoApproveOnCreate: true,
      };
    case "cso":
      return {
        canCreate: true,
        canEditFields: true,
        canReview: true,
        canApprove: true,
        canReject: true,
        canDeactivate: true,
        canDelete: false,
        autoApproveOnCreate: true,
      };
    case "regional_manager":
      return {
        canCreate: true,
        canEditFields: true,
        canReview: true,
        canApprove: true,
        canReject: true,
        canDeactivate: false,
        canDelete: false,
        autoApproveOnCreate: true,
      };
    case "wh_manager":
      return {
        canCreate: true,
        // WH managers receive the manager-review email when a guard adds a
        // pending provider on the fly. They need to be able to fill in the
        // missing contact details and approve / reject from the drawer.
        canEditFields: true,
        canReview: false,
        canApprove: true,
        canReject: true,
        canDeactivate: false,
        canDelete: false,
        autoApproveOnCreate: true,
      };
    default:
      return {
        canCreate: false,
        canEditFields: false,
        canReview: false,
        canApprove: false,
        canReject: false,
        canDeactivate: false,
        canDelete: false,
        autoApproveOnCreate: false,
      };
  }
}

// ── Blank form ────────────────────────────────────────────────────────────────
const BLANK = {
  name: "",
  code: "",
  type: "transport" as ServiceProviderType,
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  address: "",
  city: "",
  state: "",
  warehouseId: null as string | null,
  isActive: true,
};

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  /** null → create mode; otherwise edit/review mode */
  editing: FgServiceProvider | null;
  user: FgUser | null;
  warehouses: FgWarehouse[];
  /** Warehouse name used in alert messages (for WH Manager creation flow). */
  warehouseName?: string;
  onSaved: () => void;
}

export function ServiceProviderDrawer({
  open,
  onClose,
  editing,
  user,
  warehouses,
  warehouseName,
  onSaved,
}: Props) {
  const perms = getSpPermissions(user);
  const orgId = user?.orgId ?? "";

  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof BLANK, string>>>({});
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<null | "review" | "approve" | "reject">(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Sync form when drawer opens / editing changes
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name ?? "",
        code: editing.code ?? "",
        type: editing.type ?? "other",
        contactName: editing.contactName ?? "",
        contactPhone: editing.contactPhone ?? "",
        contactEmail: editing.contactEmail ?? "",
        address: editing.address ?? "",
        city: editing.city ?? "",
        state: editing.state ?? "",
        warehouseId: editing.warehouseId ?? null,
        isActive: editing.isActive ?? false,
      });
    } else {
      const defaultWh = user?.role === "wh_manager" && user.warehouseId ? user.warehouseId : null;
      setForm({ ...BLANK, warehouseId: defaultWh });
    }
    setErrors({});
    setActing(null);
    setRejectOpen(false);
    setRejectReason("");
  }, [open, editing, user?.role, user?.warehouseId]);

  const isCreate = !editing;
  const fieldsReadOnly = !isCreate && !perms.canEditFields;
  const canSaveFieldChanges = isCreate ? perms.canCreate : perms.canEditFields;

  function validate(): boolean {
    const e: Partial<Record<keyof typeof BLANK, string>> = {};

    if (!form.name.trim()) e.name = "Required";
    if (!form.code.trim()) e.code = "Required";
    if (!form.city.trim()) e.city = "Required";

    if (!form.contactName.trim()) {
      e.contactName = "Contact name is required";
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!form.contactPhone.trim()) {
      e.contactPhone = "Mobile number is required";
    } else if (!phoneRegex.test(form.contactPhone)) {
      e.contactPhone = "Enter valid 10-digit mobile number";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.contactEmail.trim()) {
      e.contactEmail = "Email is required";
    } else if (!emailRegex.test(form.contactEmail)) {
      e.contactEmail = "Enter a valid email address";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!user || !orgId) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const base = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        contactEmail: form.contactEmail.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state,
        warehouseId: form.warehouseId || null,
      };

      if (editing) {
        await updateServiceProvider(editing.id, {
          ...base,
          isActive: form.isActive,
        });
      } else {
        const initialStatus: ServiceProviderStatus = perms.autoApproveOnCreate
          ? "approved"
          : "pending";
        const id = await createServiceProvider({
          ...base,
          orgId,
          isActive: perms.autoApproveOnCreate,
          status: initialStatus,
          createdByUid: user.uid,
          createdByRole: user.role,
          reviewedByUid: null,
          approvedByUid: perms.autoApproveOnCreate ? user.uid : null,
          rejectedByUid: null,
          rejectionReason: null,
        });

        // Note: a "service provider awaiting approval" notice was previously
        // raised as a `contract_expiring` alert; that type was dropped when
        // alerts collapsed onto incidents, so the notice is now surfaced
        // only on the SP roster page.
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("[ServiceProviderDrawer] save failed", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleReview() {
    if (!user || !editing) return;
    setActing("review");
    try {
      await reviewServiceProvider(editing.id, user.uid);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setActing(null);
    }
  }

  async function handleApprove() {
    if (!user || !editing) return;
    setActing("approve");
    try {
      await approveServiceProvider(editing.id, user.uid);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    if (!user || !editing) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    setActing("reject");
    try {
      await rejectServiceProvider(editing.id, user.uid, reason);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setActing(null);
    }
  }

  // ── Dynamic title / subtitle ──────────────────────────────────────────────
  const title = isCreate
    ? "Add service provider"
    : perms.canEditFields
      ? "Edit service provider"
      : "Service provider";
  const subtitle = editing
    ? `Editing ${editing.name}`
    : perms.autoApproveOnCreate
      ? "Register a company that arrives at your gates"
      : "New providers go to pending for review and approval.";

  const status: ServiceProviderStatus | null = editing?.status ?? null;
  // Review (intermediate "pending → reviewed") is a Firestore-era concept; the
  // Supabase contractors table only models pending/approved/rejected. Keep the
  // helper around for compatibility but hide the action so reviewers go
  // straight from pending → approved (or pending → rejected).
  const showReview = false;
  const showApprove =
    !!editing && perms.canApprove && status !== "approved" && status !== "rejected";
  const showReject = !!editing && perms.canReject && status !== "approved" && status !== "rejected";

  return (
    <SlidePanel open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="space-y-4">
        {/* Status strip (edit mode only) */}
        {editing && status && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Workflow status
              </span>
              <Badge tone={STATUS_TONE[status]} dot>
                {STATUS_LABEL[status]}
              </Badge>
            </div>
            <div className="space-y-0.5 text-[11.5px] text-slate-600">
              {editing.createdByUid && (
                <div>
                  Created {fmtDate(editing.createdAt)}
                  {editing.createdByRole ? ` · by ${editing.createdByRole.replace("_", " ")}` : ""}
                </div>
              )}
              {editing.reviewedAt && <div>Reviewed {fmtDate(editing.reviewedAt)}</div>}
              {editing.approvedAt && <div>Approved {fmtDate(editing.approvedAt)}</div>}
              {editing.rejectedAt && (
                <div className="text-danger-600">
                  Rejected {fmtDate(editing.rejectedAt)}
                  {editing.rejectionReason ? ` — ${editing.rejectionReason}` : ""}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Provider name */}
        <Field label="Provider name" required error={errors.name}>
          <input
            name="sp-name"
            autoComplete="off"
            className={inputCls(errors.name)}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Samarth Logistics"
            disabled={fieldsReadOnly}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider code" required error={errors.code}>
            <input
              name="sp-code"
              autoComplete="off"
              className={inputCls(errors.code)}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. SL-001"
              maxLength={12}
              disabled={fieldsReadOnly}
            />
          </Field>
          <Field label="Type" required>
            <select
              className={inputCls()}
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as ServiceProviderType }))
              }
              disabled={fieldsReadOnly}
            >
              {SP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact name" required error={errors.contactName}>
            <input
              name="sp-contact-name"
              autoComplete="off"
              className={inputCls()}
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              placeholder="Contact person"
              disabled={fieldsReadOnly}
            />
          </Field>
          <Field label="Contact phone" required error={errors.contactPhone}>
            <input
              name="sp-contact-phone"
              autoComplete="off"
              className={inputCls()}
              value={form.contactPhone}
              onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              placeholder="+91 98XXX XXXXX"
              disabled={fieldsReadOnly}
              maxLength={10}
            />
          </Field>
        </div>

        <Field label="Contact email" required error={errors.contactEmail}>
          <input
            type="email"
            name="sp-contact-email"
            autoComplete="off"
            className={inputCls()}
            value={form.contactEmail}
            onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
            placeholder="contact@provider.com"
            disabled={fieldsReadOnly}
          />
        </Field>

        <Field label="Address">
          <input
            name="sp-address"
            autoComplete="off"
            className={inputCls()}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Street / locality"
            disabled={fieldsReadOnly}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="City" required error={errors.city}>
            <input
              name="sp-city"
              autoComplete="off"
              className={inputCls(errors.city)}
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="City"
              disabled={fieldsReadOnly}
            />
          </Field>
          <Field label="State">
            <select
              className={inputCls()}
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              disabled={fieldsReadOnly}
            >
              <option value="">Select state</option>
              {INDIA_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Gate scope">
          <select
            className={inputCls()}
            value={form.warehouseId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value || null }))}
            disabled={fieldsReadOnly}
          >
            <option value="">All warehouses</option>
            {(user?.role === "wh_manager"
              ? warehouses.filter((w) => w.id === user.warehouseId)
              : warehouses
            ).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400">
            {user?.role === "wh_manager"
              ? 'Choose "All warehouses" or restrict to your assigned warehouse.'
              : '"All warehouses" makes this provider selectable at every gate. Pick one to restrict.'}
          </p>
        </Field>

        {/* isActive toggle — only roles that can deactivate see it */}
        {editing && perms.canDeactivate && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              id="sp-active"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <label htmlFor="sp-active" className="text-[13px] font-medium text-slate-700">
              Provider is active
            </label>
          </div>
        )}

        {/* ── Action buttons ──────────────────────────────────────────────────── */}
        <div className="space-y-2 pt-2">
          {/* Primary: save / add */}
          {canSaveFieldChanges && (
            <div className="flex gap-3">
              <Button full size="md" onClick={handleSave} disabled={saving || acting !== null}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add provider"}
              </Button>
              <Button full size="md" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          )}

          {/* Read-only close button for roles without edit perms in edit mode */}
          {!canSaveFieldChanges && (
            <Button full size="md" variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}

          {/* Approval workflow actions */}
          {(showReview || showApprove || showReject) && (
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <div className="flex flex-wrap gap-2">
                {showReview && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
                    onClick={handleReview}
                    disabled={acting !== null}
                  >
                    {acting === "review" ? "Marking…" : "Mark as reviewed"}
                  </Button>
                )}
                {showApprove && (
                  <Button
                    size="sm"
                    leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    onClick={handleApprove}
                    disabled={acting !== null}
                  >
                    {acting === "approve" ? "Approving…" : "Approve & activate"}
                  </Button>
                )}
                {showReject && !rejectOpen && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<XCircle className="h-3.5 w-3.5" />}
                    onClick={() => setRejectOpen(true)}
                    disabled={acting !== null}
                  >
                    Reject
                  </Button>
                )}
              </div>

              {showReject && rejectOpen && (
                <div className="space-y-2 rounded-lg border border-danger-200 bg-danger-50/40 p-3">
                  <label className="block text-[11.5px] font-semibold text-danger-700">
                    Reason for rejection
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Explain why this provider is being rejected (e.g. duplicate, untrusted, bad contact info)"
                    rows={3}
                    className={textareaCls()}
                    disabled={acting === "reject"}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleReject}
                      disabled={!rejectReason.trim() || acting !== null}
                    >
                      {acting === "reject" ? "Rejecting…" : "Confirm reject"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRejectOpen(false);
                        setRejectReason("");
                      }}
                      disabled={acting === "reject"}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </SlidePanel>
  );
}
