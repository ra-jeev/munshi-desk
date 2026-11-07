import HomePage from "@/components/home/HomePage";
import { APP_TITLE } from "@/lib/app-config";

const SEO_TITLE = `${APP_TITLE} - a clerk for a small pouch factory`;
const SEO_DESCRIPTION =
  "Munshi keeps a small pouch factory's orders, machine plan and payments. Every change is a card the owner approves. Demo data only.";

export function meta() {
  return [
    { title: SEO_TITLE },
    {
      name: "description",
      content: SEO_DESCRIPTION,
    },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default function HomeRoute() {
  return <HomePage />;
}
