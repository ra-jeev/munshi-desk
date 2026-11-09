import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useAgentKitControl } from "@agent-native/toolkit/app/agentkit";
import { registerActionChatRenderer } from "@agent-native/toolkit/app/chat";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  OrderForm,
  ProposalSummary,
  type Preview,
} from "@/components/factory/FactoryPage";
import { OperatorProposal } from "@/components/factory/OperatorProposal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { factoryError } from "@/lib/factory-error";

import type { Operation } from "../server/lib/contracts";
import type { view } from "../server/lib/factory";
import type { operatorPreview } from "../server/lib/operator";

type Draft = { operation: Operation; previewId: string } | null;
type CardState = {
  editing: boolean;
  corrected: Preview | null;
  saved: boolean;
  draft: Draft;
};

// The chat redraws this card when the run behind it ends, for example after a
// correction denies the pending approval. Card state lives here, keyed by the
// proposal's requestId, so a redraw keeps the correction in progress.
const cardStates = new Map<string, CardState>();

function useCardState<K extends keyof CardState>(
  key: string | undefined,
  field: K,
  initial: CardState[K],
) {
  const stored = key ? cardStates.get(key)?.[field] : undefined;
  const [value, setValue] = useState<CardState[K]>(stored ?? initial);
  const set = (next: CardState[K]) => {
    if (key) {
      const current = cardStates.get(key) ?? {
        editing: false,
        corrected: null,
        saved: false,
        draft: null,
      };
      cardStates.set(key, { ...current, [field]: next });
    }
    setValue(next);
  };
  return [value, set] as const;
}

function EditableProposal({ result }: { result: Preview }) {
  const t = useT();
  const control = useAgentKitControl();
  const key = result?.requestId;
  const [editing, setEditing] = useCardState(key, "editing", false);
  const [corrected, setCorrected] = useCardState(key, "corrected", null);
  const [saved, setSaved] = useCardState(key, "saved", false);
  const [draft, setDraft] = useCardState(key, "draft", null);
  const factory = useActionQuery("get-factory", {}, { enabled: editing });
  const check = useActionQuery(
    "check-proposal",
    draft ?? { operation: { kind: "cancel-order", orderId: "none" } },
    { enabled: !!draft, retry: false },
  );
  const save = useActionMutation("save-proposal");
  useEffect(() => {
    if (draft && check.data) {
      setCorrected(check.data as Preview);
      setEditing(false);
      setDraft(null);
    }
    if (draft && check.error) {
      toast.error(
        factoryError(check.error) ??
          t("factory.chatRenderer.couldNotPreviewCorrection"),
      );
      setDraft(null);
    }
  }, [draft, check.data, check.error, t]);
  if (!result?.operation) return <Skeleton className="h-24 w-full" />;
  const active = corrected ?? result;
  const isOrder = active.operation.kind === "create-order";
  const approveKey = corrected
    ? "factory.chatRenderer.approveCorrectedOrder"
    : isOrder
      ? "factory.chatRenderer.approveOrder"
      : "factory.chatRenderer.approveProposal";
  const savedKey = corrected
    ? "factory.chatRenderer.correctedSaved"
    : isOrder
      ? "factory.chatRenderer.orderSaved"
      : "factory.chatRenderer.proposalSaved";
  if (editing && active.operation.kind === "create-order")
    return (
      <div className="space-y-3 rounded-xl border bg-card p-4">
        {factory.data ? (
          <OrderForm
            data={factory.data as ReturnType<typeof view>}
            initial={active.operation}
            onPreview={async (operation) => {
              try {
                // Editing withdraws any pending agent run. The corrected card uses the
                // same read action and explicit owner approval as the manual order form.
                // A pending approval is denied, not cancelled: cancelling the run
                // replaces this card with raw output and leaves stale Approve buttons.
                const thread = await control.load();
                const waiting = Object.entries(thread.approvalRunIds);
                const waitingRuns = new Set(waiting.map(([, runId]) => runId));
                await Promise.all([
                  ...waiting.map(([approvalId, runId]) =>
                    control.resolveApproval(runId, approvalId, {
                      decision: "deny",
                    }),
                  ),
                  ...thread.activeRunIds
                    .filter((id) => !waitingRuns.has(id))
                    .map((id) => control.cancel(id)),
                ]);
                setDraft({ operation, previewId: crypto.randomUUID() });
              } catch {
                toast.error(t("factory.chatRenderer.couldNotWithdraw"));
              }
            }}
          />
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
        {check.isFetching && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("factory.chatRenderer.checkingCorrection")}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(false);
            setDraft(null);
          }}
        >
          {t("factory.chatRenderer.cancelCorrection")}
        </Button>
      </div>
    );
  return (
    <div className="space-y-2">
      <ProposalSummary result={active} />
      {!saved && (
        <div className="flex flex-wrap gap-2">
          {isOrder && (
            <Button
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={() => setEditing(true)}
            >
              {t("factory.chatRenderer.correctOrder")}
            </Button>
          )}
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={async () => {
              try {
                // Same previewed request as the agent's gated save, so a later
                // native approval replays this result instead of saving twice.
                await save.mutateAsync({
                  operation: active.operation,
                  revision: active.revision,
                  plannedAt: active.plannedAt,
                  requestId: active.requestId,
                });
                setSaved(true);
                toast.success(t(savedKey));
                // Close the chat's own "Approve to run save proposal?" bar. Its
                // save has the same requestId, so it replays this save instead
                // of saving again. A corrected card already denied that save.
                if (!corrected) {
                  try {
                    const thread = await control.load();
                    await Promise.all(
                      Object.entries(thread.approvalRunIds).map(
                        ([approvalId, runId]) =>
                          control.resolveApproval(runId, approvalId, {
                            decision: "approve",
                            optionIds: ["approve"],
                          }),
                      ),
                    );
                  } catch {
                    // Saved already; the bar is only a leftover.
                  }
                }
              } catch (e) {
                toast.error(
                  factoryError(e) ??
                    t("factory.chatRenderer.proposalCouldNotSave"),
                );
              }
            }}
          >
            {save.isPending ? t("factory.chatRenderer.saving") : t(approveKey)}
          </Button>
        </div>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(savedKey)}
        </p>
      )}
    </div>
  );
}
registerActionChatRenderer({
  id: "munshi-proposal",
  renderer: "munshi-proposal",
  Component: ({ context }) => (
    <EditableProposal result={context.resultJson as Preview} />
  ),
});
registerActionChatRenderer({
  id: "munshi-operator-proposal",
  renderer: "munshi-operator-proposal",
  Component: ({ context }) => (
    <OperatorProposal
      result={context.resultJson as ReturnType<typeof operatorPreview>}
    />
  ),
});
