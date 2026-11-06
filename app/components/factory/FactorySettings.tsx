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
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function SettingsForm({
  data,
  onPreview,
  initial,
}: {
  data: Factory;
  onPreview: (op: Operation) => void;
  initial?: Settings | undefined;
}) {
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
        <h2 className="font-medium">Working hours, IST</h2>
        {shifts.map((shift, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor={`shift-${i}-start`}>Shift {i + 1} start</Label>
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
              <Label htmlFor={`shift-${i}-end`}>Shift {i + 1} end</Label>
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
                variant="ghost"
                onClick={() => setShifts((s) => s.filter((_, j) => j !== i))}
              >
                Remove
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
            Add shift
          </Button>
        )}
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">Weekly days off</legend>
          <div className="flex flex-wrap gap-4">
            {days.map((day, i) => (
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
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="holidays">Holidays, one date per line</Label>
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
        <h2 className="font-medium">Default rates</h2>
        <div className="grid grid-cols-2 gap-4">
          {(["packets", "kg"] as const).map((unit) => (
            <div key={unit} className="space-y-2">
              <Label htmlFor={`rate-${unit}`}>
                {unit === "kg" ? "INR per kg" : "INR per packet"}
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
        <h2 className="font-medium">Machines</h2>
        {machines.map((m, i) => (
          <fieldset key={m.id} className="space-y-4 rounded-xl border p-4">
            <legend className="px-1 text-sm">
              {m.name || `Machine ${i + 1}`}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`machine-${i}-name`}>Name</Label>
                <Input
                  id={`machine-${i}-name`}
                  value={m.name}
                  required
                  onChange={(e) => machine(i, { name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`machine-${i}-stage`}>Stage</Label>
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
                    <SelectItem value="cutting">Cutting</SelectItem>
                    <SelectItem value="packing">Packing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`machine-${i}-speed`}>
                  {m.stage === "cutting"
                    ? "Speed, kg/hour"
                    : "Speed, packets/hour"}
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
                  Size changeover, minutes
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
              variant="ghost"
              size="sm"
              disabled={machines.length <= 2}
              onClick={() => setMachines((ms) => ms.filter((_, j) => j !== i))}
            >
              Remove machine
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
                  name: "New machine",
                  stage: "packing",
                  speedPerHour: 1200,
                  kgPerHour: 20,
                  changeoverMin: 20,
                },
              ])
            }
          >
            Add machine
          </Button>
        )}
      </section>
      <Button disabled={busy}>
        {busy ? "Checking settings…" : "Preview changes"}
      </Button>
    </form>
  );
}
export function FactorySettings() {
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
      setError(factoryError(check.error) ?? "Could not preview settings.");
      setDraft(null);
    }
  }, [draft, check.data, check.error]);
  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error)
    return (
      <p role="alert">
        {factoryError(query.error) ?? "Factory settings could not load."}
      </p>
    );
  if (!data?.ready)
    return <p>Load demo data on Today before configuring the factory.</p>;
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
              Edit
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
                  toast.success("Factory settings saved.");
                } catch (e) {
                  setError(
                    factoryError(e) ??
                      "Settings could not save. Preview them again.",
                  );
                }
              }}
            >
              {save.isPending ? "Saving…" : "Approve settings"}
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
          Checking the new plan…
        </p>
      )}
    </div>
  );
}
