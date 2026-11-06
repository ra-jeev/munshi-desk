import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useAgentKitControl } from "@agent-native/toolkit/app/agentkit";
import { registerActionChatRenderer } from "@agent-native/toolkit/app/chat";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  OrderForm,
  ProposalSummary,
  type Preview,
} from "@/components/factory/FactoryPage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { factoryError } from "@/lib/factory-error";

import type { Operation } from "../server/lib/contracts";
import type { view } from "../server/lib/factory";

function EditableProposal({ result }: { result: Preview }) {
  const control = useAgentKitControl();
  const [editing, setEditing] = useState(false);
  const [corrected, setCorrected] = useState<Preview | null>(null);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<{
    operation: Operation;
    previewId: string;
  } | null>(null);
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
        factoryError(check.error) ?? "Could not preview this correction.",
      );
      setDraft(null);
    }
  }, [draft, check.data, check.error]);
  if (!result?.operation) return <Skeleton className="h-24 w-full" />;
  const active = corrected ?? result;
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
                const thread = await control.load();
                await Promise.all(
                  thread.activeRunIds.map((id) => control.cancel(id)),
                );
                setDraft({ operation, previewId: crypto.randomUUID() });
              } catch {
                toast.error(
                  "Could not withdraw the earlier proposal. Try again.",
                );
              }
            }}
          />
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
        {check.isFetching && (
          <p role="status" className="text-sm text-muted-foreground">
            Checking the corrected plan…
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(false);
            setDraft(null);
          }}
        >
          Cancel correction
        </Button>
      </div>
    );
  return (
    <div className="space-y-2">
      <ProposalSummary result={active} />
      {active.operation.kind === "create-order" && !saved && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={save.isPending}
            onClick={() => setEditing(true)}
          >
            Correct order
          </Button>
          {corrected && (
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync({
                    operation: corrected.operation,
                    revision: corrected.revision,
                    plannedAt: corrected.plannedAt,
                    requestId: corrected.requestId,
                  });
                  setSaved(true);
                  toast.success("Corrected order saved.");
                } catch (e) {
                  toast.error(
                    factoryError(e) ??
                      "The proposal could not be saved. Preview it again.",
                  );
                }
              }}
            >
              {save.isPending ? "Saving…" : "Approve corrected order"}
            </Button>
          )}
        </div>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground">
          Corrected order saved.
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
