import { useT } from "@agent-native/core/client/i18n";
import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { factoryError } from "@/lib/factory-error";

import type { Operation } from "../../../server/lib/contracts";
import { ProposalSummary, type Factory, type Preview } from "./FactoryPage";
type Settings = Extract<Operation, { kind: "update-settings" }>["settings"];
const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
function SettingsForm({
  data,
  onPreview,
  initial,
}: {
  data: Factory;
  onPreview: (op: Operation) => void;
  initial?: Settings | undefined;
}) {
  const t = useT();
  const [shifts, setShifts] = useState(
    initial?.shifts ??
      data.calendar?.shifts ?? [
        {
          start: data.calendar?.shiftStart ?? "09:00",
          end: data.calendar?.shiftEnd ?? "19:00",
        },
      ],
  );
  const [weeklyOff, setWeeklyOff] = useState(
    initial?.weeklyOff ?? data.calendar?.weeklyOff ?? [0],
  );
  const [machines, setMachines] = useState<Settings["machines"]>(
    initial?.machines ??
      data.machines.map(
        ({ id, name, stage, speedPerHour, kgPerHour, changeoverMin }) => ({
          id,
          name,
          stage,
          speedPerHour,
          kgPerHour,
          changeoverMin,
        }),
      ),
  );
  const [busy, setBusy] = useState(false);
  function machine(
    index: number,
    patch: Partial<Settings["machines"][number]>,
  ) {
    setMachines((ms) =>
      ms.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }
  return (
    <form
      className="max-w-3xl space-y-8"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await onPreview({
            kind: "update-settings",
            settings: {
              shifts,
              weeklyOff,
              holidays: String(f.get("holidays"))
                .split(/[\s,]+/)
                .filter(Boolean),
              defaultRates: {
                packets: Math.round(Number(f.get("packets")) * 100),
                kg: Math.round(Number(f.get("kg")) * 100),
              },
              machines,
            },
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className="space-y-4">
        <h2 className="font-medium">{t("factory.settings.workingHours")}</h2>
        {shifts.map((shift, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor={`shift-${i}-start`}>{t("factory.settings.shiftStart", { n: i + 1 })}</Label>
              <Input
                id={`shift-${i}-start`}
                value={shift.start}
                placeholder="09:00"
                pattern="[0-2][0-9]:[0-5][0-9]"
                required
                onChange={(e) =>
                  setShifts((s) =>
                    s.map((v, j) =>
                      j === i ? { ...v, start: e.target.value } : v,
                    ),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`shift-${i}-end`}>{t("factory.settings.shiftEnd", { n: i + 1 })}</Label>
              <Input
                id={`shift-${i}-end`}
                value={shift.end}
                placeholder="19:00"
                required
                onChange={(e) =>
                  setShifts((s) =>
                    s.map((v, j) =>
                      j === i ? { ...v, end: e.target.value } : v,
                    ),
                  )
                }
              />
            </div>
            {shifts.length > 1 && (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => setShifts((s) => s.filter((_, j) => j !== i))}
              >
                {t("factory.settings.remove")}
              </Button>
            )}
          </div>
        ))}
        {shifts.length < 3 && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setShifts((s) => [...s, { start: "19:00", end: "23:00" }])
            }
          >
            {t("factory.settings.addShift")}
          </Button>
        )}
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">{t("factory.settings.weeklyOff")}</legend>
          <div className="flex flex-wrap gap-4">
            {dayKeys.map((dayKey, i) => {
              const day = t(`factory.daysLong.${dayKey}`);
              return (
                <div key={day} className="flex items-center gap-2">
                  <Checkbox
                    id={`off-${i}`}
                    checked={weeklyOff.includes(i)}
                    onCheckedChange={(checked) =>
                      setWeeklyOff((v) =>
                        checked ? [...v, i] : v.filter((d) => d !== i),
                      )
                    }
                  />
                  <Label htmlFor={`off-${i}`}>{day}</Label>
                </div>
              );
            })}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="holidays">{t("factory.settings.holidays")}</Label>
          <Textarea
            id="holidays"
            name="holidays"
            placeholder="2026-11-08"
            defaultValue={(
              initial?.holidays ??
              data.calendar?.holidays ??
              []
            ).join("\n")}
          />
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="font-medium">{t("factory.settings.defaultRates")}</h2>
        <div className="grid grid-cols-2 gap-4">
          {(["packets", "kg"] as const).map((unit) => (
            <div key={unit} className="space-y-2">
              <Label htmlFor={`rate-${unit}`}>
                {unit === "kg"
                  ? t("factory.settings.perKgRate")
                  : t("factory.settings.perPacketRate")}
              </Label>
              <Input
                id={`rate-${unit}`}
                name={unit}
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={
                  (initial?.defaultRates[unit] ?? data.defaultRates[unit]) / 100
                }
              />
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="font-medium">{t("factory.settings.machines")}</h2>
        {machines.map((m, i) => (
          <fieldset key={m.id} className="space-y-4 rounded-xl border p-4">
            <legend className="px-1 text-sm">
              {m.name || t("factory.settings.machineNumber", { n: i + 1 })}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`machine-${i}-name`}>{t("factory.settings.name")}</Label>
                <Input
                  id={`machine-${i}-name`}
                  value={m.name}
                  required
                  onChange={(e) => machine(i, { name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`machine-${i}-stage`}>{t("factory.settings.stage")}</Label>
                <Select
                  value={m.stage}
                  onValueChange={(v) =>
                    machine(i, { stage: v as "cutting" | "packing" })
                  }
                >
                  <SelectTrigger id={`machine-${i}-stage`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cutting">{t("factory.stage.cutting")}</SelectItem>
                    <SelectItem value="packing">{t("factory.stage.packing")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`machine-${i}-speed`}>
                  {m.stage === "cutting"
                    ? t("factory.settings.speedKgHour")
                    : t("factory.settings.speedPacketsHour")}
                </Label>
                <Input
                  id={`machine-${i}-speed`}
                  type="number"
                  min="1"
                  value={m.stage === "cutting" ? m.kgPerHour : m.speedPerHour}
                  onChange={(e) =>
                    machine(
                      i,
                      m.stage === "cutting"
                        ? { kgPerHour: Number(e.target.value) }
                        : { speedPerHour: Number(e.target.value) },
                    )
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`machine-${i}-changeover`}>
                  {t("factory.settings.changeoverMin")}
                </Label>
                <Input
                  id={`machine-${i}-changeover`}
                  type="number"
                  min="0"
                  value={m.changeoverMin}
                  onChange={(e) =>
                    machine(i, { changeoverMin: Number(e.target.value) })
                  }
                  required
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={machines.length <= 2}
              onClick={() => setMachines((ms) => ms.filter((_, j) => j !== i))}
            >
              {t("factory.settings.removeMachine")}
            </Button>
          </fieldset>
        ))}
        {machines.length < 50 && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setMachines((ms) => [
                ...ms,
                {
                  id: crypto.randomUUID(),
                  name: t("factory.settings.newMachine"),
                  stage: "packing",
                  speedPerHour: 1200,
                  kgPerHour: 20,
                  changeoverMin: 20,
                },
              ])
            }
          >
            {t("factory.settings.addMachine")}
          </Button>
        )}
      </section>
      <Button disabled={busy}>
        {busy ? t("factory.settings.checkingSettings") : t("factory.settings.previewChanges")}
      </Button>
    </form>
  );
}
type OperatorsData = {
  operators: { email: string; machineId: string | null }[];
  machines: { id: string; name: string; stage: string }[];
};

function OperatorsSection() {
  const t = useT();
  const query = useActionQuery("list-factory-operators", {});
  const data = query.data as OperatorsData | undefined;
  const link = useActionMutation("set-operator-machine");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const machineName = (id: string | null) =>
    data?.machines.find((m) => m.id === id)?.name ?? "";
  return (
    <section className="max-w-3xl space-y-4 border-t pt-6">
      <h2 className="font-medium">{t("factory.settings.operatorsTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("factory.settings.operatorsDesc")}</p>
      {query.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : query.error ? (
        <p role="alert" className="text-sm text-destructive">
          {factoryError(query.error) ?? t("factory.settings.operatorsCouldNotLoad")}
        </p>
      ) : !data || data.operators.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("factory.settings.operatorsEmpty")}</p>
      ) : (
        <div className="space-y-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          {data.operators.map((op) => (
            <div key={op.email} className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label>{t("factory.settings.operator")}</Label>
                <p className="text-sm">{op.email}
                  {op.machineId ? (
                    <span className="text-muted-foreground"> · {machineName(op.machineId)}</span>
                  ) : null}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`op-machine-${op.email}`}>{t("factory.settings.machine")}</Label>
                <Select
                  value={picks[op.email] ?? op.machineId ?? ""}
                  onValueChange={(v) => setPicks((p) => ({ ...p, [op.email]: v }))}
                >
                  <SelectTrigger id={`op-machine-${op.email}`} className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.machines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={link.isPending || !(picks[op.email] ?? op.machineId)}
                onClick={async () => {
                  const machineId = picks[op.email] ?? op.machineId;
                  if (!machineId) return;
                  setError("");
                  try {
                    const result = await link.mutateAsync({ email: op.email, machineId });
                    toast.success(t("factory.settings.linkSaved", { machine: (result as { machineName?: string }).machineName ?? machineName(machineId) }));
                    await query.refetch();
                  } catch (e) {
                    setError(factoryError(e) ?? t("factory.settings.linkCouldNotSave"));
                  }
                }}
              >
                {link.isPending ? t("factory.common.saving") : t("factory.settings.linkMachine")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function FactorySettings() {
  const t = useT();
  const query = useActionQuery("get-factory", {});
  const data = query.data as Factory | undefined;
  const [draft, setDraft] = useState<{
    operation: Operation;
    previewId: string;
  } | null>(null);
  const [proposal, setProposal] = useState<Preview | null>(null);
  const [initial, setInitial] = useState<Settings | undefined>();
  const [error, setError] = useState("");
  const check = useActionQuery(
    "check-proposal",
    draft ?? { operation: { kind: "cancel-order", orderId: "none" } },
    { enabled: !!draft, retry: false },
  );
  const save = useActionMutation("save-proposal");
  useEffect(() => {
    if (draft && check.data) {
      setProposal(check.data as Preview);
      setDraft(null);
    }
    if (draft && check.error) {
      setError(factoryError(check.error) ?? t("factory.settings.previewSettingsFailed"));
      setDraft(null);
    }
  }, [draft, check.data, check.error, t]);
  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error)
    return (
      <p role="alert">
        {factoryError(query.error) ?? t("factory.settings.settingsCouldNotLoad")}
      </p>
    );
  if (!data?.ready)
    return <p>{t("factory.settings.loadDemoFirst")}</p>;
  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {proposal ? (
        <div className="max-w-3xl space-y-4">
          <ProposalSummary result={proposal} />
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                if (proposal.operation.kind === "update-settings")
                  setInitial(proposal.operation.settings);
                setProposal(null);
              }}
            >
              {t("factory.common.edit")}
            </Button>
            <Button
              disabled={save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync({
                    operation: proposal.operation,
                    revision: proposal.revision,
                    plannedAt: proposal.plannedAt,
                    requestId: proposal.requestId,
                  });
                  setProposal(null);
                  setInitial(undefined);
                  setError("");
                  toast.success(t("factory.settings.settingsSaved"));
                } catch (e) {
                  setError(
                    factoryError(e) ??
                      t("factory.settings.settingsCouldNotSave"),
                  );
                }
              }}
            >
              {save.isPending ? t("factory.common.saving") : t("factory.settings.approveSettings")}
            </Button>
          </div>
        </div>
      ) : (
        <SettingsForm
          data={data}
          initial={initial}
          onPreview={(operation) => {
            setError("");
            setDraft({ operation, previewId: crypto.randomUUID() });
          }}
        />
      )}
      {check.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("factory.settings.checkingNewPlan")}
        </p>
      )}
      <OperatorsSection />
    </div>
  );
}
