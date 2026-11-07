import { MyJobsPage } from "@/components/factory/MyJobsPage";
export function meta() {
  return [{ title: "My jobs | Munshi Desk" }]; // i18n-ignore server meta fallback; client title is localized via useSetPageTitle
}
export default function Page() {
  return <MyJobsPage />;
}
