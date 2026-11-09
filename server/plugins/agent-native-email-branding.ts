import { defineAppConfig } from "@agent-native/core/server";

export default defineAppConfig({
  app: {
    id: "munshi-desk",
    slug: "munshi-desk",
    // This name appears in transactional emails. Change it to your product name.
    name: "Munshi Desk",
    // The source template keeps a renamed app from inheriting first-party email branding.
    sourceTemplate: "chat",
    // /home sends owners to Today and operators to My jobs.
    homePath: "/home",
    // Optional: use your own absolute HTTPS logo URL in transactional emails.
    // logoUrl: "https://example.com/logo.png",
  },
});
