import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
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
export function uiLocale(): "en-IN" | "hi-IN" {
  if (
    typeof document !== "undefined" &&
    document.documentElement.lang === "hi-IN"
  )
    return "hi-IN";
  return "en-IN";
}
const money = (n: number) =>
  new Intl.NumberFormat(uiLocale(), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n / 100);
const dateLabel = (v: string) =>
  new Intl.DateTimeFormat(uiLocale(), { day: "numeric", month: "short" }).format(
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
  const t = useT();
  const op = result.operation;
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <strong>
          {
            (
              {
                "create-order": t("factory.proposal.createOrder"),
                "update-order": t("factory.proposal.updateOrder"),
                "record-payment": t("factory.proposal.recordPayment"),
                "cancel-order": t("factory.proposal.cancelOrder"),
                "machine-down": t("factory.proposal.machineDown"),
                "add-customer": t("factory.proposal.addCustomer"),
                "job-progress": t("factory.proposal.jobProgress"),
                "update-settings": t("factory.proposal.updateSettings"),
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
            <span className="text-muted-foreground">{t("factory.proposal.product")}</span>
            <p>{op.order.product}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("factory.proposal.size")}</span>
            <p>{op.order.size}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("factory.proposal.quantity")}</span>
            <p>
              {op.order.quantity.toLocaleString(uiLocale())} {t(`factory.units.${op.order.unit}`)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("factory.proposal.due")}</span>
            <p>{dateLabel(op.order.dueDate)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("factory.proposal.rate")}</span>
            <p>
              {money(op.order.ratePaise)} /{" "}
              {t(`factory.units.${op.order.unit === "kg" ? "kg" : "packet"}`)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("factory.proposal.amount")}</span>
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
            {t("factory.proposal.orderLine", {
              product: result.orderDetails.product,
              size: result.orderDetails.size,
              qty: result.orderDetails.quantity.toLocaleString(uiLocale()),
              unit: t(`factory.units.${result.orderDetails.unit}`),
            })}
          </p>
        )}
      {op.kind === "job-progress" && (
        <p>
          {t("factory.proposal.jobProgressLine", {
            verb: t(
              `factory.proposal.${op.status === "started" ? "start" : op.status === "paused" ? "pause" : "complete"}`,
            ),
            stage: t(`factory.stageLower.${op.stage}`),
            qty: op.quantity.toLocaleString(uiLocale()),
            unit:
              "orderDetails" in result
                ? t(`factory.units.${result.orderDetails?.unit ?? "packets"}`)
                : t("factory.proposal.units"),
          })}
        </p>
      )}
      {op.kind === "update-settings" && (
        <div className="space-y-3">
          <p>
            {t("factory.proposal.shifts", {
              shifts: op.settings.shifts.map((s) => s.start + "–" + s.end).join(", "),
            })}
          </p>
          <p>
            {t("factory.proposal.weeklyOff", {
              days:
                op.settings.weeklyOff
                  .map((d) =>
                    t(
                      `factory.days.${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d] as string}`,
                    ),
                  )
                  .join(", ") || t("factory.proposal.none"),
            })}
          </p>
          <p>{t("factory.proposal.holidays", { dates: op.settings.holidays.join(", ") || t("factory.proposal.none") })}</p>
          <p>
            {t("factory.proposal.defaultRate", {
              packetRate: money(op.settings.defaultRates.packets),
              kgRate: money(op.settings.defaultRates.kg),
            })}
          </p>
          {op.settings.machines.map((m) => (
            <p key={m.id}>
              {m.name} ·{" "}
              {m.stage === "cutting"
                ? t("factory.proposal.kgPerHour", { n: m.kgPerHour })
                : t("factory.proposal.packetsPerHour", { n: m.speedPerHour.toLocaleString(uiLocale()) })}{" "}
              · {t("factory.proposal.changeover", { n: m.changeoverMin })}
            </p>
          ))}
        </div>
      )}
      {op.kind === "record-payment" && (
        <>
          <p>
            {t("factory.proposal.receivedBy", {
              amount: money(op.amountPaise),
              mode: t(`factory.paymentMode.${op.mode}`),
            })}
          </p>
          {typeof result.balanceAfterPaise === "number" &&
            typeof result.balanceBeforePaise === "number" && (
              <p className="text-muted-foreground">
                {t("factory.proposal.balance", {
                  before: money(result.balanceBeforePaise!),
                  after: money(result.balanceAfterPaise),
                })}
              </p>
            )}
        </>
      )}
      {op.kind === "machine-down" && (
        <p>
          {t("factory.proposal.machineDownLine", {
            from: dateLabel(op.from),
            to: dateLabel(op.to),
            reason: op.reason,
          })}
        </p>
      )}
      {op.kind === "create-order" && op.noOvertime && <p>{t("factory.proposal.noOvertime")}</p>}
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
                  {d.previousReady} {t("factory.proposal.to")}
                </span>
              )}
              {d.ready}
              {d.lateDays > 0 && (
                <span className="ml-2 text-destructive">
                  {t("factory.proposal.late", { days: d.lateDays })}
                </span>
              )}
            </span>
          </div>
        ))}
      {Object.keys(result.option.overtime).length > 0 && (
        <p className="text-muted-foreground">
          {t("factory.proposal.overtime", {
            items: Object.entries(result.option.overtime)
              .map(([d, m]) => `${dateLabel(d)}: ${m / 60}h`)
              .join(", "),
          })}
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
  const t = useT();
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
        <Label htmlFor="customer">{t("factory.orderForm.customer")}</Label>
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
        label={t("factory.orderForm.product")}
        defaultValue={initial?.order.product ?? "Transparent pouches"}
        required
      />
      <Field
        name="size"
        label={t("factory.orderForm.pouchSize")}
        placeholder={t("factory.orderForm.pouchSizePlaceholder")}
        defaultValue={initial?.order.size ?? ""}
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          name="quantity"
          label={t("factory.orderForm.quantity")}
          type="number"
          min="1"
          max="10000000"
          defaultValue={initial?.order.quantity}
          required
        />
        <div className="space-y-2">
          <Label htmlFor="unit">{t("factory.orderForm.unit")}</Label>
          <Select
            value={unit}
            onValueChange={(v) => setUnit(v as "kg" | "packets")}
          >
            <SelectTrigger id="unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="packets">{t("factory.units.packetsLabel")}</SelectItem>
              <SelectItem value="kg">{t("factory.units.kilogramsLabel")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field
          name="due"
          label={t("factory.orderForm.dueDate")}
          type="date"
          defaultValue={initial?.order.dueDate ?? today()}
          required
        />
        <Field
          name="rate"
          label={t("factory.orderForm.ratePerUnit")}
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
        {busy ? t("factory.orderForm.checkingProposal") : t("factory.orderForm.previewOrder")}
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
  const t = useT();
  useSetPageTitle(t(`factory.nav.${section}`));
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
      toast.success(t("factory.page.savedToFactory"));
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
          {t("factory.common.tryAgain")}
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
          {new Intl.DateTimeFormat(uiLocale(), {
            timeZone: "Asia/Kolkata",
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
          <span className="rounded border px-2 py-0.5 text-xs">
            {t("factory.page.demoFactory")}
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
              {t("factory.page.addCustomer")}
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
            {t("factory.page.askMunshi")}
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
            {section === "accounts"
              ? t("factory.page.recordPayment")
              : t("factory.page.newOrder")}
          </Button>
        </div>
      </div>
      {!data.ready ? (
        <div className="rounded-xl border bg-card p-8 space-y-4">
          <h2 className="text-xl font-semibold">{t("factory.page.setupTitle")}</h2>
          <p className="text-muted-foreground">
            {t("factory.page.setupDesc")}
          </p>
          <Button onClick={() => setResetOpen(true)}>{t("factory.page.loadDemoData")}</Button>
        </div>
      ) : (
        <>
          {section === "today" && (
            <>
              {late.length > 0 && (
                <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <h2 className="mb-3 font-medium">
                    {t("factory.page.lateTitle")}
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
                          {o.quantity.toLocaleString(uiLocale())} {t(`factory.units.${o.unit}`)} ·{" "}
                          {o.size}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-destructive">
                          {t("factory.page.lateText", {
                            days: deliveries.get(o.id)?.lateDays,
                            unit:
                              deliveries.get(o.id)?.lateDays === 1
                                ? t("factory.page.day")
                                : t("factory.page.days"),
                          })}
                        </p>
                        <p>{t("factory.page.dueOn", { date: dateLabel(o.dueDate) })}</p>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => ask(t("factory.page.reviewLatePrompt"))}
                  >
                    {t("factory.page.reviewWithMunshi")}
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
                {t("factory.page.factorySettings")}
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
                  {t("factory.page.reportMachineOff")}
                </Button>
              </div>
              <MachineLanes data={data} onProgress={onPreview} />
              <section className="rounded-xl border p-4 text-sm">
                <h2 className="mb-3 font-medium">{t("factory.page.workingCalendar")}</h2>
                <p>
                  {t("factory.page.calendarLine", {
                    from: data.calendar?.shiftStart,
                    to: data.calendar?.shiftEnd,
                  })}
                </p>
                <p className="mt-2 text-muted-foreground">
                  {t("factory.page.overtime")}{" "}
                  {Object.entries(data.calendar?.overtime ?? {})
                    .map(([d, m]) => `${dateLabel(d)}: ${m} min`)
                    .join(", ") || t("factory.page.notScheduled")}
                </p>
              </section>
            </>
          )}
          {section === "orders" && (
            <>
              <Input
                aria-label={t("factory.page.searchLabel")}
                placeholder={t("factory.page.searchPlaceholder")}
                className="max-w-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="overflow-hidden rounded-xl border">
                <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 bg-muted/50 px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
                  <span>{t("factory.page.colCustomer")}</span>
                  <span>{t("factory.page.colQuantity")}</span>
                  <span>{t("factory.page.colDueReady")}</span>
                  <span>{t("factory.page.colAmount")}</span>
                </div>
                {filtered.length === 0 && (
                  <p className="p-6 text-muted-foreground">
                    {t("factory.page.noMatching")}
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
                          {o.status === "done"
                            ? t("factory.page.complete")
                            : t("factory.page.cancelled")}
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
                            {t("factory.page.editOrder")}
                          </Button>{" "}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1"
                            onClick={() =>
                              onPreview({ kind: "cancel-order", orderId: o.id })
                            }
                          >
                            {t("factory.page.cancelOrder")}
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm">
                      {o.quantity.toLocaleString(uiLocale())} {t(`factory.units.${o.unit}`)}
                    </p>
                    <div className="text-sm">
                      <p>{t("factory.page.dueOn", { date: dateLabel(o.dueDate) })}</p>
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
                      {t("factory.page.billedReceived", {
                        billed: money(c.billedPaise),
                        paid: money(c.paidPaise),
                      })}
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
                        {t("factory.page.customerLedger")}
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
                              {t("factory.page.ledgerOrder", {
                                product: o.product,
                                qty: o.quantity.toLocaleString(uiLocale()),
                                unit: t(`factory.units.${o.unit}`),
                                amount: money(o.quantity * o.ratePaise),
                                date: dateLabel(o.dueDate),
                              })}
                              {o.status === "cancelled"
                                ? t("factory.page.cancelledSuffix")
                                : ""}
                            </p>
                          ))}
                        {data.payments
                          .filter((p) => p.customerId === c.id)
                          .slice(-10)
                          .reverse()
                          .map((p) => (
                            <p key={p.id}>
                              {t("factory.page.receivedLine", {
                                amount: money(p.amountPaise),
                                mode: t(`factory.paymentMode.${p.mode}`),
                                date: new Intl.DateTimeFormat(uiLocale(), {
                                  timeZone: "Asia/Kolkata",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }).format(new Date(p.createdAt)),
                              })}
                            </p>
                          ))}
                        {!data.orders.some((o) => o.customerId === c.id) &&
                          !data.payments.some((p) => p.customerId === c.id) && (
                            <p className="text-muted-foreground">
                              {t("factory.page.noOrdersOrPayments")}
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
                        {c.billedPaise < c.paidPaise
                          ? t("factory.page.credit")
                          : t("factory.page.outstanding")}
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
                      {t("factory.page.record")}
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
              {t("factory.page.resetDemoData")}
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
                ? t("factory.page.reviewBeforeSaving")
                : dialog === "customer"
                  ? t("factory.page.addCustomerTitle")
                  : editingOrderId
                    ? t("factory.page.editOrderTitle")
                    : dialog === "payment"
                      ? t("factory.page.recordPaymentTitle")
                      : dialog === "down"
                        ? t("factory.page.reportMachineOffTitle")
                        : t("factory.page.newOrderTitle")}
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
                    ? t("factory.page.comparingPlans")
                    : t("factory.page.compareScheduleOptions")}
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
                    ? t("factory.common.back")
                    : t("factory.common.edit")}
                </Button>
                {localError && (
                  <Button
                    variant="outline"
                    disabled={check.isFetching || save.isPending}
                    onClick={() => onPreview(proposal.operation)}
                  >
                    {t("factory.common.previewAgain")}
                  </Button>
                )}
                <Button
                  disabled={save.isPending || check.isFetching}
                  onClick={approve}
                >
                  {save.isPending
                    ? t("factory.common.saving")
                    : t("factory.common.approveAndSave")}
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
                <Label htmlFor="payment-customer">{t("factory.orderForm.customer")}</Label>
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
                label={t("factory.page.amountReceived")}
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
                <Label htmlFor="mode">{t("factory.page.paymentMethod")}</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger id="mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["UPI", "cash", "bank", "cheque"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`factory.paymentMode.${m.toLowerCase()}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={check.isFetching}>
                {t("factory.page.previewPayment")}
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
                <Label htmlFor="machine">{t("factory.page.machine")}</Label>
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
                  label={t("factory.page.from")}
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
                  label={t("factory.page.through")}
                  type="date"
                  defaultValue={
                    formDraft?.kind === "machine-down" ? formDraft.to : today()
                  }
                  required
                />
              </div>
              <Field
                name="reason"
                label={t("factory.page.reason")}
                defaultValue={
                  formDraft?.kind === "machine-down"
                    ? formDraft.reason
                    : undefined
                }
                required
              />
              <Button className="w-full" disabled={check.isFetching}>
                {t("factory.page.previewScheduleImpact")}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {data.ready
                ? t("factory.page.resetTitleReady")
                : t("factory.page.resetTitleEmpty")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("factory.page.resetDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("factory.common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={reset.isPending}
              onClick={async () => {
                try {
                  await reset.mutateAsync({ requestId: crypto.randomUUID() });
                  toast.success(t("factory.page.demoLoaded"));
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              {t("factory.page.loadDemoData")}
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
  const t = useT();
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
                ? t("factory.machineLane.kgPerHour", { n: m.kgPerHour })
                : t("factory.machineLane.packetsPerHour", { n: m.speedPerHour.toLocaleString(uiLocale()) })}{" "}
              · {t("factory.machineLane.changeover", { n: m.changeoverMin })}
            </span>
          </div>
          {m.downFrom && (
            <p className="border-b px-4 py-2 text-sm text-destructive">
              {t("factory.machineLane.off", {
                from: dateLabel(m.downFrom),
                to: dateLabel(m.downTo!),
                reason: m.downReason,
              })}
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
                    <span className="mx-1">{t("factory.proposal.to")}</span>
                    {j.end.slice(0, 10) !== j.start.slice(0, 10)
                      ? dateLabel(j.end.slice(0, 10)) + " "
                      : ""}
                    {j.end.slice(11)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {j.quantity.toLocaleString(uiLocale())} {t(`factory.units.${j.unit}`)} ·{" "}
                    {j.state === "running"
                      ? t("factory.machineLane.running")
                      : j.state === "paused"
                        ? t("factory.machineLane.paused")
                        : t("factory.machineLane.queued")}
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
                        {t("factory.machineLane.pause")}
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
                        {t("factory.machineLane.start")}
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
                      {t("factory.machineLane.complete")}
                    </Button>
                  </div>
                </div>
              ))}
            {data.jobs.filter((j) => j.machineId === m.id).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("factory.machineLane.noJobs")}</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
