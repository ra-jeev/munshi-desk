import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { IconArrowRight, IconTool } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { factoryError } from "@/lib/factory-error";

import type { Operation } from "../../../server/lib/contracts";
import type { myJobs, operatorPreview } from "../../../server/lib/operator";

type Jobs = ReturnType<typeof myJobs>;
type Preview = ReturnType<typeof operatorPreview>;
type Job = Jobs["jobs"][number];

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dateLabel = (v: string) =>
  new Intl.DateTimeFormat(
    document.documentElement.lang === "hi-IN" ? "hi-IN" : "en-IN",
    { day: "numeric", month: "short" },
  ).format(new Date(v + "T12:00:00+05:30"));

export function MyJobsPage() {
  const t = useT();
  useSetPageTitle(t("factory.nav.myJobs"));
  const query = useActionQuery("my-jobs", {});
  const data = query.data as Jobs | undefined;
  const save = useActionMutation("save-operator-report");
  const [pendingOp, setPendingOp] = useState<Operation | null>(null);
  const check = useActionQuery(
    "check-operator-proposal",
    pendingOp ? { operation: pendingOp } : { operation: { kind: "machine-down", machineId: "", from: today(), to: today(), reason: "x" } },
    { enabled: !!pendingOp, retry: false },
  );
  const [proposal, setProposal] = useState<Preview | null>(null);
  const [requestId, setRequestId] = useState("");
  const [localError, setLocalError] = useState("");
  const [offOpen, setOffOpen] = useState(false);

  useEffect(() => {
    if (check.data && pendingOp) {
      setProposal(check.data as Preview);
      setRequestId((check.data as Preview).requestId);
      setPendingOp(null);
    } else if (check.error && pendingOp) {
      setLocalError(factoryError(check.error));
      toast.error(factoryError(check.error));
      setPendingOp(null);
    }
  }, [check.data, check.error, pendingOp]);

  async function approve() {
    if (!proposal) return;
    try {
      await save.mutateAsync({
        operation: proposal.operation,
        revision: proposal.revision,
        plannedAt: proposal.plannedAt,
        requestId,
      });
      toast.success(t("factory.myJobs.saved"));
      setProposal(null);
      setOffOpen(false);
      await query.refetch();
    } catch (e) {
      setLocalError(factoryError(e));
      toast.error(factoryError(e));
    }
  }

  if (query.isLoading)
    return (
      <div className="p-6 space-y-5">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  if (query.error)
    return (
      <div className="p-8 space-y-4">
        <p role="alert">{factoryError(query.error)}</p>
        <p className="text-sm text-muted-foreground">{t("factory.myJobs.noMachine")}</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          {t("factory.common.tryAgain")}
        </Button>
      </div>
    );
  if (!data) return null;

  const onProgress = (job: Job, status: "started" | "paused" | "done") => {
    setLocalError("");
    setPendingOp({
      kind: "job-progress",
      orderId: job.orderId,
      machineId: data.machineId,
      stage: job.stage as "cutting" | "packing",
      status,
      quantity: job.quantity,
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {t("factory.myJobs.machine")}: <span className="font-medium text-foreground">{data.machineName}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOffOpen(true);
            setProposal(null);
          }}
        >
          <IconTool className="size-4" />
          {t("factory.myJobs.reportOff")}
        </Button>
      </div>

      {localError && (
        <p role="alert" className="text-sm text-destructive">{localError}</p>
      )}

      {data.jobs.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-muted-foreground">
          {t("factory.myJobs.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {data.jobs.map((job) => (
            <div key={job.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{job.product} · {job.size}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {job.quantity.toLocaleString()} {t(`factory.units.${job.unit}`)} ·{" "}
                    {t(`factory.stage.${job.stage}`)} ·{" "}
                    {t(`factory.machineLane.${job.state === "running" ? "running" : job.state === "paused" ? "paused" : "queued"}`)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {dateLabel(job.start.slice(0, 10))} · {job.start.slice(11)}{" "}
                    <span className="mx-1">{t("factory.proposal.to")}</span>
                    {job.end.slice(0, 10) !== job.start.slice(0, 10) ? `${dateLabel(job.end.slice(0, 10))} ` : ""}
                    {job.end.slice(11)}
                  </p>
                </div>
                {job.state !== "done" && (
                  <div className="flex flex-wrap gap-2">
                    {job.state !== "running" && (
                      <Button size="sm" onClick={() => onProgress(job, "started")}>
                        {t("factory.myJobs.started")}
                        <IconArrowRight className="size-4" />
                      </Button>
                    )}
                    {job.state === "running" && (
                      <Button size="sm" variant="outline" onClick={() => onProgress(job, "paused")}>
                        {t("factory.myJobs.paused")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onProgress(job, "done")}>
                      {t("factory.myJobs.done")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!proposal || offOpen}
        onOpenChange={(v) => {
          if (!v) {
            setProposal(null);
            setOffOpen(false);
            setLocalError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {proposal
                ? t("factory.page.reviewBeforeSaving")
                : t("factory.myJobs.offTitle")}
            </DialogTitle>
          </DialogHeader>
          {localError && (
            <p role="alert" className="text-sm text-destructive">{localError}</p>
          )}
          {proposal ? (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
                <p className="font-medium">{proposal.machineName}</p>
                {proposal.orderSummary && (
                  <p>
                    {proposal.orderSummary.product} · {proposal.orderSummary.size} ·{" "}
                    {proposal.orderSummary.quantity.toLocaleString()}{" "}
                    {t(`factory.units.${proposal.orderSummary.unit}`)}
                  </p>
                )}
                {proposal.operation.kind === "job-progress" && (
                  <p>
                    {t(
                      `factory.myJobs.${proposal.operation.status === "started" ? "started" : proposal.operation.status === "paused" ? "paused" : "done"}`,
                    )}{" "}
                    · {t(`factory.stage.${proposal.operation.stage}`)}
                  </p>
                )}
                {proposal.operation.kind === "machine-down" && (
                  <p>
                    {dateLabel(proposal.operation.from)} ·{" "}
                    {dateLabel(proposal.operation.to)} · {proposal.operation.reason}
                  </p>
                )}
                {proposal.deliveries
                  .filter((d) => d.moved || d.lateDays > 0)
                  .map((d) => (
                    <p key={d.id} className="text-muted-foreground">
                      {d.ready}
                      {d.lateDays > 0 ? ` · ${t("factory.proposal.late", { days: d.lateDays })}` : ""}
                    </p>
                  ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setProposal(null);
                    setLocalError("");
                  }}
                >
                  {t("factory.common.back")}
                </Button>
                <Button disabled={save.isPending} onClick={approve}>
                  {save.isPending ? t("factory.common.saving") : t("factory.common.approveAndSave")}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setPendingOp({
                  kind: "machine-down",
                  machineId: data.machineId,
                  from: String(f.get("from")),
                  to: String(f.get("to")),
                  reason: String(f.get("reason")),
                });
              }}
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from">{t("factory.page.from")}</Label>
                  <Input id="from" name="from" type="date" defaultValue={today()} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to">{t("factory.page.through")}</Label>
                  <Input id="to" name="to" type="date" defaultValue={today()} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">{t("factory.page.reason")}</Label>
                <Input id="reason" name="reason" required />
              </div>
              <Button className="w-full" disabled={check.isFetching}>
                {check.isFetching ? t("factory.myJobs.previewing") : t("factory.page.previewScheduleImpact")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
