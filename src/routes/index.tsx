import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Pirate Tracker | Pregled saveza" },
    { name: "description", content: "Piratski poeni, misije i koordinacija tvog Ikariam saveza." },
    { property: "og:title", content: "Pirate Tracker | Pregled saveza" },
    { property: "og:description", content: "Pregled poena i piratskih aktivnosti saveza." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
