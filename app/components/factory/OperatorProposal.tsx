import { useActionMutation } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { factoryError } from "@/lib/factory-error";

import type { operatorPreview } from "../../../server/lib/operator";
import { uiLocale } from "./FactoryPage";

type Preview = ReturnType<typeof operatorPreview>;

const dateLabel = (v: string) =>
  new Intl.DateTimeFormat(uiLocale(), { day: "numeric", month: "short" }).format(
    new Date(v + "T12:00:00+05:30"),
  );

// Saved reports are remembered by revision + change, so a redraw or a
// duplicate card for the same report shows it as saved.
const savedIds = new Set<string>();

/** What will be saved and how many deliveries it delays; no owner data. */
export function OperatorProposalSummary({ result }: { result: Preview }) {
  const t = useT();
  const op = result.operation;
  const late = result.deliveries.filter((d) => d.lateDays > 0).length;
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
        <strong>
          {op.kind === "machine-down"
            ? t("factory.proposal.machineDown")
            : t("factory.proposal.jobProgress")}
        </strong>
        <p className="font-medium">{result.machineName}</p>
        {op.kind === "job-progress" && (
          <p>
            {t("factory.proposal.jobProgressLine", {
              verb: t(
                `factory.proposal.${op.status === "started" ? "start" : op.status === "paused" ? "pause" : "complete"}`,
              ),
              stage: t(`factory.stageLower.${op.stage}`),
              qty: op.quantity.toLocaleString(uiLocale()),
              unit: result.orderSummary
                ? t(`factory.units.${result.orderSummary.unit}`)
                : t("factory.proposal.units"),
            })}
          </p>
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
        {late > 0 && (
          <p className="border-t pt-2 text-destructive">
            {t("factory.proposal.lateDeliveries", { n: late })}
          </p>
        )}
    </div>
  );
}

/** Operator report card in chat: same look as the owner's proposal card. */
export function OperatorProposal({ result }: { result: Preview }) {
  const t = useT();
  const save = useActionMutation("save-operator-report");
  const [saved, setSavedState] = useState(
    () =>
      !!result?.operation &&
      savedIds.has(`${result.revision}:${JSON.stringify(result.operation)}`),
  );
  if (!result?.operation) return <Skeleton className="h-24 w-full" />;
  return (
    <div className="space-y-2">
      <OperatorProposalSummary result={result} />
      {saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("factory.myJobs.saved")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync({
                  operation: result.operation,
                  revision: result.revision,
                  plannedAt: result.plannedAt,
                  requestId: result.requestId,
                });
                savedIds.add(
                  `${result.revision}:${JSON.stringify(result.operation)}`,
                );
                setSavedState(true);
                toast.success(t("factory.myJobs.saved"));
              } catch (e) {
                toast.error(factoryError(e));
              }
            }}
          >
            {save.isPending
              ? t("factory.chatRenderer.saving")
              : t("factory.chatRenderer.approveProposal")}
          </Button>
        </div>
      )}
    </div>
  );
}
