import { FactoryPage } from "@/components/factory/FactoryPage";
export function meta() {
  return [{ title: "Orders | Munshi Desk" }]; // i18n-ignore server meta fallback; client title is localized via useSetPageTitle
}
export default function Page() {
  return <FactoryPage section="orders" />;
}
