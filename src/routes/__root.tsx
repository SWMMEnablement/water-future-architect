import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-sm text-muted-foreground">Page not found.</p>
        <Link to="/" className="mt-6 inline-block text-sm text-primary underline">
          Back to docs
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SWMM-X — Architecture Docs" },
      { name: "description", content: "SWMM-X v1: project format, .inp compatibility, results Parquet, JSON Schema." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      activeProps={{ className: "block rounded-md px-3 py-2 text-sm bg-accent text-foreground font-medium" }}
      activeOptions={{ exact: true }}
    >
      {label}
    </Link>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex max-w-[1400px] gap-8 px-6 py-8">
          <aside className="hidden w-60 shrink-0 md:block">
            <div className="sticky top-8">
              <Link to="/" className="block">
                <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Autodesk Water</div>
                <div className="mt-1 text-lg font-semibold tracking-tight">SWMM-X <span className="text-muted-foreground font-normal">v1.0</span></div>
              </Link>
              <nav className="mt-8 space-y-1">
                <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Design</div>
                <NavLink to="/" label="Architecture plan" />
                <NavLink to="/mapping" label=".inp ↔ SWMM-X" />
                <NavLink to="/schemas" label="Schema viewer" />
              </nav>
              <div className="mt-10 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
                Draft spec — design discussion. Not yet implemented.
              </div>
            </div>
          </aside>
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
