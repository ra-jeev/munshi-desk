import { useActionQuery } from "@agent-native/core/client/hooks";
import { Navigate } from "react-router";

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

// The framework's Get started page is not part of Munshi. Home is the
// factory: owners land on Today, operators on My jobs.
export default function HomeRoute() {
  const role = useActionQuery("get-my-role", {}, { retry: false });
  if (role.isLoading) return null;
  const isOperator =
    (role.data as { role?: string } | undefined)?.role === "operator";
  return <Navigate to={isOperator ? "/my-jobs" : "/today"} replace />;
}
