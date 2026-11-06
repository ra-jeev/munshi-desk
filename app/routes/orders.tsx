import { FactoryPage } from "@/components/factory/FactoryPage";
export function meta() {
  return [{ title: "Orders | Munshi Desk" }];
}
export default function Page() {
  return <FactoryPage section="orders" />;
}
