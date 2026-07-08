import { createFileRoute } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: "#fcfbf8" }}
    >
      <h1 className="text-6xl font-bold tracking-tight text-neutral-900">
        Orhan
      </h1>
    </div>
  );
}
