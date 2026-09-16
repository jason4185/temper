import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TemperLogo } from "./brand";
import { cn } from "@/lib/utils";
import { WalletControl } from "@/lib/genlayer/wallet";

const nav = [
  ["Dashboard", "/dashboard"],
  ["Create Agreement", "/agreements/new"],
  ["Cases", "/cases"],
  ["How It Works", "/how-it-works"],
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const dark = pathname !== "/" && pathname !== "/how-it-works" && pathname !== "/agreements/new";
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur-xl",
        dark ? "border-surface-border bg-ink/90" : "border-border bg-paper/85",
      )}
    >
      <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-5 lg:px-10">
        <TemperLogo inverse={dark} />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {nav.map(([label, to]) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                dark
                  ? "text-paper/65 hover:bg-paper/10 hover:text-paper"
                  : "text-muted-foreground hover:bg-ink/5 hover:text-ink",
              )}
              activeProps={{
                className: dark ? "bg-paper/10 text-paper" : "bg-violet-soft text-ink",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <WalletControl dark={dark} />
          <Button
            variant="ghost"
            size="icon"
            className={cn("lg:hidden", dark && "text-paper hover:bg-paper/10")}
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <nav
          className={cn(
            "grid gap-1 border-t p-4 lg:hidden",
            dark ? "border-surface-border bg-ink" : "border-border bg-paper",
          )}
          aria-label="Mobile navigation"
        >
          {nav.map(([label, to]) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-4 py-3 text-sm font-semibold",
                dark ? "text-paper hover:bg-paper/10" : "text-ink hover:bg-violet-soft",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-paper">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <TemperLogo />
        <p className="text-sm text-muted-foreground">
          Enforceable remedies after liability, powered by GenLayer.
        </p>
        <span className="text-xs font-semibold uppercase text-muted-foreground">Studio Dev</span>
      </div>
    </footer>
  );
}

export function AppPage({ children }: { children: React.ReactNode }) {
  return <main className="min-h-[calc(100vh-4.5rem)] bg-ink text-paper">{children}</main>;
}

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-[1440px] px-5 py-10 lg:px-10 lg:py-14", className)}>
      {children}
    </div>
  );
}
