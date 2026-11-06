import { FactoryPage } from "@/components/factory/FactoryPage";
export function meta() {
  return [{ title: "Today | Munshi Desk" }];
}
export default function Page() {
  return <FactoryPage section="today" />;
}
