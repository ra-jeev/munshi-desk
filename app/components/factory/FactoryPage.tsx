import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { buildSettingsRoute } from "@agent-native/core/client/navigation";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import {
  IconArrowRight,
  IconCalendar,
  IconCash,
  IconMessage,
  IconPlus,
  IconRefresh,
  IconTool,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { factoryError } from "@/lib/factory-error";

import type { Operation } from "../../../server/lib/contracts";
import type { preview, view } from "../../../server/lib/factory";
import { CustomerForm } from "./CustomerForm";
import { VoiceInput } from "./VoiceInput";

export type Factory = ReturnType<typeof view>;
export type Preview = ReturnType<typeof preview>;
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n / 100);
const dateLabel = (v: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(
    new Date(v + "T12:00:00+05:30"),
  );
const errorMessage = factoryError;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const ask = (message: string) =>
  sendToAgentChat({ message, submit: true, openSidebar: true });

export function ProposalSummary({ result }: { result: Preview }) {
  const op = result.operation;
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <strong>
          {
            (
              {
                "create-order": "Order proposal",
                "update-order": "Update order",
                "record-payment": "Payment proposal",
                "cancel-order": "Cancel order",
                "machine-down": "Machine stoppage",
                "add-customer": "Add customer",
                "job-progress": "Job progress",
                "update-settings": "Factory settings",
              } as const
            )[op.kind]
          }
        </strong>
        {result.customerName && (
          <span className="text-sm text-muted-foreground">
            {result.customerName}
          </span>
        )}
      </div>
      {(op.kind === "create-order" || op.kind === "update-order") && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-muted-foreground">Product</span>
            <p>{op.order.product}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Size</span>
            <p>{op.order.size}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Quantity</span>
            <p>
              {op.order.quantity.toLocaleString("en-IN")} {op.order.unit}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Due</span>
            <p>{dateLabel(op.order.dueDate)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Rate</span>
            <p>
              {money(op.order.ratePaise)} /{" "}
              {op.order.unit === "kg" ? "kg" : "packet"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Amount</span>
            <p>{money(op.order.quantity * op.order.ratePaise)}</p>
          </div>
        </div>
      )}
      {"machineName" in result && result.machineName && (
        <p className="font-medium">{result.machineName}</p>
      )}
      {op.kind === "add-customer" && (
        <p>
          {op.name}
          {op.phone ? " · " + op.phone : ""}
        </p>
      )}
      {op.kind === "cancel-order" &&
        "orderDetails" in result &&
        result.orderDetails && (
          <p>
            {result.orderDetails.product} · {result.orderDetails.size} ·{" "}
            {result.orderDetails.quantity.toLocaleString("en-IN")}{" "}
            {result.orderDetails.unit}
          </p>
        )}
      {op.kind === "job-progress" && (
        <p>
          {op.status === "started"
            ? "Start"
            : op.status === "paused"
              ? "Pause"
              : "Complete"}{" "}
          {op.stage} · {op.quantity.toLocaleString("en-IN")}{" "}
          {"orderDetails" in result
            ? (result.orderDetails?.unit ?? "units")
            : "units"}
        </p>
      )}
      {op.kind === "update-settings" && (
        <div className="space-y-3">
          <p>
            Shifts:{" "}
            {op.settings.shifts.map((s) => s.start + "–" + s.end).join(", ")}{" "}
            IST
          </p>
          <p>
            Weekly off:{" "}
            {op.settings.weeklyOff
              .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
              .join(", ") || "None"}
          </p>
          <p>Holidays: {op.settings.holidays.join(", ") || "None"}</p>
          <p>
            Default rate: {money(op.settings.defaultRates.packets)} per packet ·{" "}
            {money(op.settings.defaultRates.kg)} per kg
          </p>
          {op.settings.machines.map((m) => (
            <p key={m.id}>
              {m.name} ·{" "}
              {m.stage === "cutting"
                ? m.kgPerHour + " kg/hour"
                : m.speedPerHour + " packets/hour"}{" "}
              · {m.changeoverMin} min changeover
            </p>
          ))}
        </div>
      )}
      {op.kind === "record-payment" && (
        <>
          <p>
            {money(op.amountPaise)} received by {op.mode}
          </p>
          {typeof result.balanceAfterPaise === "number" &&
            typeof result.balanceBeforePaise === "number" && (
              <p className="text-muted-foreground">
                Balance {money(result.balanceBeforePaise!)} to{" "}
                {money(result.balanceAfterPaise)}
              </p>
            )}
        </>
      )}
      {op.kind === "machine-down" && (
        <p>
          {dateLabel(op.from)} to {dateLabel(op.to)} · {op.reason}
        </p>
      )}
      {op.kind === "create-order" && op.noOvertime && <p>No added overtime.</p>}
      {"planningNote" in result && result.planningNote && (
        <p className="text-muted-foreground">{result.planningNote}</p>
      )}
      {result.deliveries
        .filter((d) => d.moved || d.id === "proposed" || d.lateDays > 0)
        .map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap justify-between gap-2 border-t pt-2"
          >
            <span>{d.customer}</span>
            <span>
              {d.moved && d.previousReady && (
                <span className="mr-2 text-muted-foreground">
                  {d.previousReady} to
                </span>
              )}
              {d.ready}
              {d.lateDays > 0 && (
                <span className="ml-2 text-destructive">
                  {d.lateDays}d late
                </span>
              )}
            </span>
          </div>
        ))}
      {Object.keys(result.option.overtime).length > 0 && (
        <p className="text-muted-foreground">
          Overtime:{" "}
          {Object.entries(result.option.overtime)
            .map(([d, m]) => `${dateLabel(d)}: ${m / 60}h`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

export function OrderForm({
  data,
  onPreview,
  initial,
}: {
  data: Factory;
  onPreview: (op: Operation) => void;
  initial?: Extract<Operation, { kind: "create-order" }> | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState(
    initial?.order.customerId ?? data.customers[0]?.id ?? "",
  );
  const [unit, setUnit] = useState<"packets" | "kg">(
    initial?.order.unit ?? "packets",
  );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          await onPreview({
            kind: "create-order",
            noOvertime: initial?.noOvertime ?? false,
            order: {
              customerId,
              product: String(f.get("product")),
              size: String(f.get("size")),
              quantity: Number(f.get("quantity")),
              unit,
              dueDate: String(f.get("due")),
              ratePaise: Math.round(Number(f.get("rate")) * 100),
            },
            option: initial?.option ?? { place: "normal", overtime: {} },
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="customer">Customer</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger id="customer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Field
        name="product"
        label="Product"
        defaultValue={initial?.order.product ?? "Transparent pouches"}
        required
      />
      <Field
        name="size"
        label="Pouch size"
        placeholder="4x6 inch"
        defaultValue={initial?.order.size ?? ""}
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          name="quantity"
          label="Quantity"
          type="number"
          min="1"
          max="10000000"
          defaultValue={initial?.order.quantity}
          required
        />
        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Select
            value={unit}
            onValueChange={(v) => setUnit(v as "kg" | "packets")}
          >
            <SelectTrigger id="unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="packets">Packets</SelectItem>
              <SelectItem value="kg">Kilograms</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field
          name="due"
          label="Due date"
          type="date"
          defaultValue={initial?.order.dueDate ?? today()}
          required
        />
        <Field
          name="rate"
          label="Rate per unit, INR"
          type="number"
          step="0.01"
          min="0"
          defaultValue={
            initial
              ? initial.order.ratePaise / 100
              : data.defaultRates[unit] / 100
          }
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !customerId}>
        {busy ? "Checking proposal…" : "Preview order"}
        <IconArrowRight className="size-4" />
      </Button>
    </form>
  );
}
function Field({
  label,
  name,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}

export function FactoryPage({
  section,
}: {
  section: "today" | "orders" | "machines" | "accounts";
}) {
  useSetPageTitle(section.charAt(0).toUpperCase() + section.slice(1));
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const query = useActionQuery("get-factory", {});
  const data = query.data as Factory | undefined;
  const cache = useQueryClient();
  const previousFactory = useRef<Factory | undefined>(undefined);
  const save = useActionMutation("save-proposal", {
    onMutate: async (args) => {
      const op = args.operation as Operation;
      if (op.kind !== "record-payment") return;
      await cache.cancelQueries({ queryKey: ["action", "get-factory", {}] });
      previousFactory.current = cache.getQueryData<Factory>([
        "action",
        "get-factory",
        {},
      ]);
      if (previousFactory.current)
        cache.setQueryData(["action", "get-factory", {}], {
          ...previousFactory.current,
          accounts: previousFactory.current.accounts.map((c) =>
            c.id === op.customerId
              ? { ...c, paidPaise: c.paidPaise + op.amountPaise }
              : c,
          ),
        });
    },
    onError: () => {
      if (previousFactory.current)
        cache.setQueryData(
          ["action", "get-factory", {}],
          previousFactory.current,
        );
      previousFactory.current = undefined;
    },
    onSuccess: () => {
      previousFactory.current = undefined;
    },
  });
  const reset = useActionMutation("load-demo-data");
  const [pendingCheck, setPendingCheck] = useState<{
    operation: Operation;
    previewId: string;
    search: boolean;
  } | null>(null);
  const check = useActionQuery(
    pendingCheck?.search ? "search-plans" : "check-proposal",
    pendingCheck ?? { operation: { kind: "cancel-order", orderId: "none" } },
    { enabled: !!pendingCheck, retry: false },
  );
  const [editing, setEditing] = useState<
    Extract<Operation, { kind: "create-order" }> | undefined
  >(undefined);
  const [dialog, setDialog] = useState<
    "order" | "payment" | "down" | "customer" | null
  >(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [proposal, setProposal] = useState<Preview | null>(null);
  const [formDraft, setFormDraft] = useState<Operation | null>(null);
  const [requestId, setRequestId] = useState("");
  const [localError, setLocalError] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [search, setSearch] = useState("");
  function onPreview(operation: Operation, search = false) {
    setLocalError("");
    setFormDraft(operation);
    if (operation.kind === "create-order" && editingOrderId)
      operation = {
        kind: "update-order",
        orderId: editingOrderId,
        order: operation.order,
      };
    setPendingCheck({ operation, previewId: crypto.randomUUID(), search });
  }
  useEffect(() => {
    if (check.data && pendingCheck) {
      setProposal(check.data as Preview);
      setRequestId((check.data as Preview).requestId);
      setPendingCheck(null);
    } else if (check.error && pendingCheck) {
      setLocalError(errorMessage(check.error));
      toast.error(errorMessage(check.error));
      setPendingCheck(null);
    }
  }, [check.data, check.error, pendingCheck]);
  async function approve() {
    if (!proposal) return;
    try {
      await save.mutateAsync({
        operation: proposal.operation,
        revision: proposal.revision,
        plannedAt: proposal.plannedAt,
        requestId,
      });
      toast.success("Saved to your factory.");
      setFormDraft(null);
      setProposal(null);
      setDialog(null);
      setLocalError("");
    } catch (e) {
      setLocalError(errorMessage(e));
      toast.error(errorMessage(e));
    }
  }
  function close() {
    setFormDraft(null);
    setDialog(null);
    setProposal(null);
    setEditingOrderId(null);
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete("orderId");
        return next;
      },
      { replace: true },
    );
    setLocalError("");
  }
  if (query.isLoading)
    return (
      <div className="p-6 space-y-5">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  if (query.error)
    return (
      <div className="p-8 space-y-4">
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!data) return null;
  const filtered = data.orders.filter((o) =>
    [o.product, data.customers.find((c) => c.id === o.customerId)?.name, o.size]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const deliveries = new Map(data.deliveries.map((d) => [d.id, d]));
  const late = data.orders.filter(
    (o) => (deliveries.get(o.id)?.lateDays ?? 0) > 0,
  );
  return (
    <div className="factory-workboard mx-auto w-full max-w-7xl space-y-6 p-4 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconCalendar className="size-4" />
          {new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
          <span className="rounded border px-2 py-0.5 text-xs">
            Demo factory
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <VoiceInput />
          {(section === "orders" || section === "accounts") && (
            <Button
              size="sm"
              variant="outline"
              disabled={!data.ready}
              onClick={() => {
                setDialog("customer");
                setProposal(null);
              }}
            >
              Add customer
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              sendToAgentChat({ message: "", submit: false, openSidebar: true })
            }
          >
            <IconMessage className="size-4" />
            Ask Munshi
          </Button>
          <Button
            size="sm"
            disabled={!data.ready}
            onClick={() => {
              setEditingOrderId(null);
              setSearchParams(
                (p) => {
                  const next = new URLSearchParams(p);
                  next.delete("orderId");
                  return next;
                },
                { replace: true },
              );
              setEditing(undefined);
              setDialog(section === "accounts" ? "payment" : "order");
              setProposal(null);
            }}
          >
            <IconPlus className="size-4" />
            {section === "accounts" ? "Record payment" : "New order"}
          </Button>
        </div>
      </div>
      {!data.ready ? (
        <div className="rounded-xl border bg-card p-8 space-y-4">
          <h2 className="text-xl font-semibold">Set up your demo factory</h2>
          <p className="text-muted-foreground">
            Load fictional customers, three machines, orders and a payment.
          </p>
          <Button onClick={() => setResetOpen(true)}>Load demo data</Button>
        </div>
      ) : (
        <>
          {section === "today" && (
            <>
              {late.length > 0 && (
                <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <h2 className="mb-3 font-medium">
                    Deliveries needing attention
                  </h2>
                  {late.map((o) => (
                    <div
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t py-3 first:border-0"
                    >
                      <div>
                        <p className="font-medium">
                          {
                            data.customers.find((c) => c.id === o.customerId)
                              ?.name
                          }
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {o.quantity.toLocaleString("en-IN")} {o.unit} ·{" "}
                          {o.size}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-destructive">
                          {deliveries.get(o.id)?.lateDays}{" "}
                          {deliveries.get(o.id)?.lateDays === 1
                            ? "day"
                            : "days"}{" "}
                          late
                        </p>
                        <p>Due {dateLabel(o.dueDate)}</p>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      ask(
                        "Review the late orders and the machine schedule. Explain what is late and use the scheduler to explore options. Show the best plan among the plans tried, then wait for approval before any write.",
                      )
                    }
                  >
                    Review with Munshi
                    <IconArrowRight className="size-4" />
                  </Button>
                </section>
              )}
              <MachineLanes data={data} onProgress={onPreview} />
            </>
          )}
          {section === "machines" && (
            <>
              <Link
                className="text-sm underline underline-offset-4"
                to={buildSettingsRoute("app", "factory")}
              >
                Factory settings
              </Link>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialog("down");
                    setProposal(null);
                  }}
                >
                  <IconTool className="size-4" />
                  Report machine off
                </Button>
              </div>
              <MachineLanes data={data} onProgress={onPreview} />
              <section className="rounded-xl border p-4 text-sm">
                <h2 className="mb-3 font-medium">Working calendar</h2>
                <p>
                  {data.calendar?.shiftStart} to {data.calendar?.shiftEnd} IST ·
                  Sunday off
                </p>
                <p className="mt-2 text-muted-foreground">
                  Overtime{" "}
                  {Object.entries(data.calendar?.overtime ?? {})
                    .map(([d, m]) => `${dateLabel(d)}: ${m} min`)
                    .join(", ") || "not scheduled"}
                </p>
              </section>
            </>
          )}
          {section === "orders" && (
            <>
              <Input
                aria-label="Search orders"
                placeholder="Search customer, product or size"
                className="max-w-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="overflow-hidden rounded-xl border">
                <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 bg-muted/50 px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
                  <span>Customer / order</span>
                  <span>Quantity</span>
                  <span>Due / ready</span>
                  <span>Amount</span>
                </div>
                {filtered.length === 0 && (
                  <p className="p-6 text-muted-foreground">
                    No matching orders.
                  </p>
                )}
                {filtered.map((o) => (
                  <div
                    key={o.id}
                    className="grid gap-3 border-t p-4 first:border-0 md:grid-cols-[2fr_1fr_1fr_1fr]"
                  >
                    <div>
                      <p className="font-medium">
                        {
                          data.customers.find((c) => c.id === o.customerId)
                            ?.name
                        }
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {o.product} · {o.size}
                      </p>
                      {o.status !== "pending" ? (
                        <p className="text-sm text-muted-foreground">
                          {o.status === "done" ? "Complete" : "Cancelled"}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={Object.keys(o.progress).length > 0}
                            onClick={() => {
                              setEditingOrderId(o.id);
                              setEditing({
                                kind: "create-order",
                                order: {
                                  customerId: o.customerId,
                                  product: o.product,
                                  size: o.size,
                                  quantity: o.quantity,
                                  unit: o.unit,
                                  dueDate: o.dueDate,
                                  ratePaise: o.ratePaise,
                                },
                                option: { place: "normal", overtime: {} },
                              });
                              setSearchParams(
                                (p) => {
                                  const next = new URLSearchParams(p);
                                  next.set("orderId", o.id);
                                  return next;
                                },
                                { replace: true },
                              );
                              setDialog("order");
                              setProposal(null);
                            }}
                          >
                            Edit order
                          </Button>{" "}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1"
                            onClick={() =>
                              onPreview({ kind: "cancel-order", orderId: o.id })
                            }
                          >
                            Cancel order
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm">
                      {o.quantity.toLocaleString("en-IN")} {o.unit}
                    </p>
                    <div className="text-sm">
                      <p>Due {dateLabel(o.dueDate)}</p>
                      <p
                        className={
                          (deliveries.get(o.id)?.lateDays ?? 0) > 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {deliveries.get(o.id)?.ready ?? o.status}
                      </p>
                    </div>
                    <p className="font-medium tabular-nums">
                      {money(o.quantity * o.ratePaise)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
          {section === "accounts" && (
            <section className="overflow-hidden rounded-xl border">
              {data.accounts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-0"
                >
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Billed {money(c.billedPaise)} · Received{" "}
                      {money(c.paidPaise)}
                    </p>
                    <details
                      className="mt-3 text-sm"
                      onToggle={(e) => {
                        if (e.currentTarget.open)
                          setSearchParams(
                            (p) => {
                              const next = new URLSearchParams(p);
                              next.set("customerId", c.id);
                              return next;
                            },
                            { replace: true },
                          );
                      }}
                    >
                      <summary className="cursor-pointer underline underline-offset-4">
                        Customer ledger
                      </summary>
                      <div className="mt-3 space-y-2">
                        {data.orders
                          .filter((o) => o.customerId === c.id)
                          .slice(-10)
                          .reverse()
                          .map((o) => (
                            <p
                              key={o.id}
                              className={
                                o.status === "cancelled"
                                  ? "text-muted-foreground line-through"
                                  : ""
                              }
                            >
                              Order · {o.product} ·{" "}
                              {o.quantity.toLocaleString("en-IN")} {o.unit} ·{" "}
                              {money(o.quantity * o.ratePaise)} · due{" "}
                              {dateLabel(o.dueDate)}
                              {o.status === "cancelled" ? " · cancelled" : ""}
                            </p>
                          ))}
                        {data.payments
                          .filter((p) => p.customerId === c.id)
                          .slice(-10)
                          .reverse()
                          .map((p) => (
                            <p key={p.id}>
                              Received {money(p.amountPaise)} · {p.mode} ·{" "}
                              {new Intl.DateTimeFormat("en-IN", {
                                timeZone: "Asia/Kolkata",
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }).format(new Date(p.createdAt))}
                            </p>
                          ))}
                        {!data.orders.some((o) => o.customerId === c.id) &&
                          !data.payments.some((p) => p.customerId === c.id) && (
                            <p className="text-muted-foreground">
                              No orders or payments yet.
                            </p>
                          )}
                      </div>
                    </details>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {money(c.billedPaise - c.paidPaise)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.billedPaise < c.paidPaise ? "credit" : "outstanding"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCustomerId(c.id);
                        setSearchParams(
                          (p) => {
                            const next = new URLSearchParams(p);
                            next.set("customerId", c.id);
                            return next;
                          },
                          { replace: true },
                        );
                        setDialog("payment");
                        setProposal(null);
                      }}
                    >
                      <IconCash className="size-4" />
                      Record
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetOpen(true)}
            >
              <IconRefresh className="size-4" />
              Reset demo data
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={dialog !== null || proposal !== null}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {proposal
                ? "Review before saving"
                : dialog === "customer"
                  ? "Add customer"
                  : editingOrderId
                    ? "Edit order"
                    : dialog === "payment"
                      ? "Record a payment"
                      : dialog === "down"
                        ? "Report machine off"
                        : "New order"}
            </DialogTitle>
          </DialogHeader>
          {localError && (
            <p role="alert" className="text-sm text-destructive">
              {localError}
            </p>
          )}
          {proposal ? (
            <>
              <ProposalSummary result={proposal} />
              {proposal.operation.kind === "create-order" && (
                <Button
                  variant="outline"
                  disabled={check.isFetching || save.isPending}
                  onClick={() => onPreview(proposal.operation, true)}
                >
                  {check.isFetching
                    ? "Comparing plans…"
                    : "Compare schedule options"}
                </Button>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={save.isPending || check.isFetching}
                  onClick={() => {
                    if (
                      proposal.operation.kind === "job-progress" ||
                      proposal.operation.kind === "cancel-order"
                    ) {
                      close();
                      return;
                    }
                    setProposal(null);
                    if (proposal.operation.kind === "update-order") {
                      setEditingOrderId(proposal.operation.orderId);
                      setEditing({
                        kind: "create-order",
                        order: proposal.operation.order,
                        option: { place: "normal", overtime: {} },
                      });
                      setDialog("order");
                    } else if (proposal.operation.kind === "create-order") {
                      setEditing(proposal.operation);
                      setDialog("order");
                    } else if (proposal.operation.kind === "record-payment") {
                      setDialog("payment");
                    } else if (proposal.operation.kind === "machine-down") {
                      setDialog("down");
                    } else if (proposal.operation.kind === "add-customer") {
                      setDialog("customer");
                    }
                  }}
                >
                  {proposal.operation.kind === "job-progress" ||
                  proposal.operation.kind === "cancel-order"
                    ? "Back"
                    : "Edit"}
                </Button>
                {localError && (
                  <Button
                    variant="outline"
                    disabled={check.isFetching || save.isPending}
                    onClick={() => onPreview(proposal.operation)}
                  >
                    Preview again
                  </Button>
                )}
                <Button
                  disabled={save.isPending || check.isFetching}
                  onClick={approve}
                >
                  {save.isPending ? "Saving…" : "Approve and save"}
                </Button>
              </div>
            </>
          ) : dialog === "customer" ? (
            <CustomerForm
              onPreview={onPreview}
              initial={
                formDraft?.kind === "add-customer" ? formDraft : undefined
              }
            />
          ) : dialog === "order" ? (
            <OrderForm data={data} onPreview={onPreview} initial={editing} />
          ) : dialog === "payment" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                onPreview({
                  kind: "record-payment",
                  customerId: customerId || data.customers[0]?.id || "",
                  amountPaise: Math.round(Number(f.get("amount")) * 100),
                  mode: paymentMode as "UPI" | "cash" | "bank" | "cheque",
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="payment-customer">Customer</Label>
                <Select
                  value={customerId || data.customers[0]?.id}
                  onValueChange={setCustomerId}
                >
                  <SelectTrigger id="payment-customer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                name="amount"
                label="Amount received, INR"
                defaultValue={
                  formDraft?.kind === "record-payment"
                    ? formDraft.amountPaise / 100
                    : undefined
                }
                type="number"
                step="0.01"
                min="0.01"
                required
              />
              <div className="space-y-2">
                <Label htmlFor="mode">Payment method</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger id="mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["UPI", "cash", "bank", "cheque"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={check.isFetching}>
                Preview payment
              </Button>
            </form>
          ) : dialog === "down" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                onPreview({
                  kind: "machine-down",
                  machineId: machineId || data.machines[0]?.id || "",
                  from: String(f.get("from")),
                  to: String(f.get("to")),
                  reason: String(f.get("reason")),
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="machine">Machine</Label>
                <Select
                  value={machineId || data.machines[0]?.id}
                  onValueChange={setMachineId}
                >
                  <SelectTrigger id="machine">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.machines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  name="from"
                  label="From"
                  type="date"
                  defaultValue={
                    formDraft?.kind === "machine-down"
                      ? formDraft.from
                      : today()
                  }
                  required
                />
                <Field
                  name="to"
                  label="Through"
                  type="date"
                  defaultValue={
                    formDraft?.kind === "machine-down" ? formDraft.to : today()
                  }
                  required
                />
              </div>
              <Field
                name="reason"
                label="Reason"
                defaultValue={
                  formDraft?.kind === "machine-down"
                    ? formDraft.reason
                    : undefined
                }
                required
              />
              <Button className="w-full" disabled={check.isFetching}>
                Preview schedule impact
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {data.ready ? "Replace factory demo data?" : "Load demo factory?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This replaces this organization's orders, machines, customers and
              payments with fictional examples.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reset.isPending}
              onClick={async () => {
                try {
                  await reset.mutateAsync({ requestId: crypto.randomUUID() });
                  toast.success("Demo factory loaded.");
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Load demo data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function MachineLanes({
  data,
  onProgress,
}: {
  data: Factory;
  onProgress: (op: Operation) => void;
}) {
  return (
    <section className="space-y-4">
      {data.machines.map((m) => (
        <div key={m.id} className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap justify-between gap-2 border-b bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${m.downFrom && m.downTo && m.downFrom <= today() && m.downTo >= today() ? "bg-destructive" : "bg-primary"}`}
              />
              <h2 className="font-medium">{m.name}</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {m.stage === "cutting"
                ? `${m.kgPerHour} kg / hour`
                : `${m.speedPerHour.toLocaleString("en-IN")} packets / hour`}{" "}
              · {m.changeoverMin} min changeover
            </span>
          </div>
          {m.downFrom && (
            <p className="border-b px-4 py-2 text-sm text-destructive">
              Off {dateLabel(m.downFrom)} to {dateLabel(m.downTo!)} ·{" "}
              {m.downReason}
            </p>
          )}
          <div className="grid gap-3 p-4 md:grid-cols-3">
            {data.jobs
              .filter((j) => j.machineId === m.id)
              .slice(0, 6)
              .map((j) => (
                <div key={j.id} className="rounded-lg border bg-muted/25 p-3">
                  <p
                    className="truncate text-sm font-medium"
                    title={j.customer}
                  >
                    {j.customer}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateLabel(j.start.slice(0, 10))} · {j.start.slice(11)}
                    <span className="mx-1">to</span>
                    {j.end.slice(0, 10) !== j.start.slice(0, 10)
                      ? dateLabel(j.end.slice(0, 10)) + " "
                      : ""}
                    {j.end.slice(11)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {j.quantity.toLocaleString("en-IN")} {j.unit} ·{" "}
                    {j.state === "running"
                      ? "Running"
                      : j.state === "paused"
                        ? "Paused"
                        : "Queued"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {j.state === "running" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onProgress({
                            kind: "job-progress",
                            orderId: j.orderId,
                            machineId: j.machineId,
                            stage: j.stage,
                            status: "paused",
                            quantity: j.quantity,
                          })
                        }
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          j.stage === "packing" &&
                          data.orders.find((o) => o.id === j.orderId)?.progress
                            .cutting?.state !== "done"
                        }
                        onClick={() =>
                          onProgress({
                            kind: "job-progress",
                            orderId: j.orderId,
                            machineId: j.machineId,
                            stage: j.stage,
                            status: "started",
                            quantity: j.quantity,
                          })
                        }
                      >
                        Start
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        j.stage === "packing" &&
                        data.orders.find((o) => o.id === j.orderId)?.progress
                          .cutting?.state !== "done"
                      }
                      onClick={() =>
                        onProgress({
                          kind: "job-progress",
                          orderId: j.orderId,
                          machineId: j.machineId,
                          stage: j.stage,
                          status: "done",
                          quantity: j.quantity,
                        })
                      }
                    >
                      Complete
                    </Button>
                  </div>
                </div>
              ))}
            {data.jobs.filter((j) => j.machineId === m.id).length === 0 && (
              <p className="text-sm text-muted-foreground">No jobs planned.</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
