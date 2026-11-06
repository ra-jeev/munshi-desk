import { FactoryPage } from "@/components/factory/FactoryPage";
export function meta() {
  return [{ title: "Machines | Munshi Desk" }];
}
export default function Page() {
  return <FactoryPage section="machines" />;
}
