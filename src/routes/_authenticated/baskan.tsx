import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/baskan")({
  beforeLoad: () => {
    throw redirect({ to: "/panel" });
  },
  component: () => null,
});
