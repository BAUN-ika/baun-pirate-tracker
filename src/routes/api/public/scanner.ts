import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/scanner")({
  server: { handlers: { POST: async ({ request }) => {
    const { scannerRequest } = await import("@/lib/scanner-api.server");
    return scannerRequest(request);
  } } },
});