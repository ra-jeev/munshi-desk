import { useT } from "@agent-native/core/client/i18n";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { Operation } from "../../../server/lib/contracts";
export function CustomerForm({
  onPreview,
  initial,
}: {
  onPreview: (op: Operation) => void;
  initial?: Extract<Operation, { kind: "add-customer" }> | undefined;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await onPreview({
            kind: "add-customer",
            name: String(f.get("name")),
            phone: String(f.get("phone")),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="new-customer-name">{t("factory.customer.nameLabel")}</Label>
        <Input
          id="new-customer-name"
          name="name"
          defaultValue={initial?.name}
          required
          maxLength={100}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-customer-phone">{t("factory.customer.phoneLabel")}</Label>
        <Input
          id="new-customer-phone"
          name="phone"
          defaultValue={initial?.phone}
          type="tel"
          placeholder="+91 98765 43210"
        />
      </div>
      <Button className="w-full" disabled={busy}>
        {busy ? t("factory.customer.checking") : t("factory.customer.preview")}
      </Button>
    </form>
  );
}
