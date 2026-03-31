import { NavLink, Outlet } from "react-router";
import { IconHome, IconArrowsExchange, IconReceipt } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", icon: IconHome, label: "Home" },
  { to: "/balances", icon: IconArrowsExchange, label: "Balances" },
  { to: "/receipts", icon: IconReceipt, label: "Receipts" },
] as const;

export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="size-5" strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
        {/* Safe-area inset for iOS notch devices */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
