import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function TemperMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-8 w-8", className)}>
      <path d="M4 5h11v9H4zM17 18h11v9H17z" fill="currentColor" />
      <path d="M16 3v26" stroke="currentColor" strokeWidth="2" />
      <path d="m6 21 8-4v10H6zM26 11l-8 4V5h8z" fill="currentColor" opacity=".35" />
    </svg>
  );
}

export function TemperLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex items-center gap-2.5 font-bold",
        inverse ? "text-paper" : "text-ink",
      )}
      aria-label="TEMPER home"
    >
      <TemperMark />
      <span className="text-xl">TEMPER</span>
    </Link>
  );
}
