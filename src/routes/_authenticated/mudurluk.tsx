import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/mudurluk")({
  beforeLoad: () => {
    throw redirect({ to: "/panel" });
  },
  component: () => null,
});
