import { Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChefHat,
  CalendarDays,
  ShoppingBasket,
  Boxes,
  Users,
  Soup,
  Search,
  Plus,
  Menu,
  LogOut,
  KeyRound,
} from "lucide-react";
import type { AuthUser, Household } from "common";
import { useMe } from "@/hooks";
import { useLogout } from "@/hooks/mutations";
import { HouseholdSwitcher } from "@/components/household-switcher";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const nav = [
  { to: "/", label: "Dashboard", icon: Soup },
  { to: "/recipes", label: "Recipes", icon: ChefHat },
  { to: "/meal-plan", label: "Meal Plan", icon: CalendarDays },
  { to: "/shopping-list", label: "Shopping", icon: ShoppingBasket },
  { to: "/pantry", label: "Pantry", icon: Boxes },
  { to: "/household", label: "Household", icon: Users },
  { to: "/access-tokens", label: "Access Tokens", icon: KeyRound },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  actions,
  compactHeaderOnMobile = false,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  compactHeaderOnMobile?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = useMe();
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Publish the sticky header's measured height so page content can pin sticky
  // toolbars directly beneath it (the header height varies with title/actions).
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [me.data]);

  // SSR and the first client render hit this branch (no session data yet), so no
  // protected content is rendered until auth is confirmed on the client.
  if (me.isLoading) return <FullScreenSpinner />;
  if (me.isError || !me.data) return <Navigate to="/login" />;
  if (!me.data.household) return <Navigate to="/onboarding" />;

  const { user, household } = me.data;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <SidebarContent pathname={pathname} household={household} user={user} />
      </aside>

      {/* Main */}
      <div
        className="flex-1 min-w-0 flex flex-col"
        style={{ "--app-header-height": `${headerHeight}px` } as CSSProperties}
      >
        <header
          ref={headerRef}
          className="sticky top-0 z-10 bg-background/85 backdrop-blur border-b border-border"
        >
          <div
            className={cn(
              "px-4 sm:px-6 md:px-10 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6",
              compactHeaderOnMobile &&
                "py-3 gap-3 sm:flex-col sm:items-stretch sm:py-5 sm:gap-4 lg:flex-row lg:items-end lg:gap-6",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <MobileNav pathname={pathname} household={household} user={user} />
              <div className="min-w-0">
                <h1
                  className={cn(
                    "text-display text-3xl md:text-4xl wrap-break-word",
                    compactHeaderOnMobile && "text-2xl sm:text-3xl md:text-4xl",
                  )}
                >
                  {title}
                </h1>
                {subtitle && (
                  <p
                    className={cn(
                      "text-sm text-muted-foreground mt-1",
                      compactHeaderOnMobile && "hidden sm:block",
                    )}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <div
              className={cn(
                "flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end",
                compactHeaderOnMobile && "sm:w-full lg:w-auto",
              )}
            >
              {actions}
            </div>
          </div>
        </header>
        <main className="px-4 sm:px-6 md:px-10 py-6 sm:py-8 flex-1">{children}</main>
      </div>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

function MobileNav({
  pathname,
  household,
  user,
}: {
  pathname: string;
  household: Household;
  user: AuthUser;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground transition hover:bg-accent hover:text-accent-foreground md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-72 max-w-[85vw] flex-col overflow-y-auto border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Navigate through Mise Kitchen OS.</SheetDescription>
        </SheetHeader>
        <SidebarContent pathname={pathname} household={household} user={user} closeOnNavigate />
      </SheetContent>
    </Sheet>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("");
}

function SidebarContent({
  pathname,
  household,
  user,
  closeOnNavigate,
}: {
  pathname: string;
  household: Household;
  user: AuthUser;
  closeOnNavigate?: boolean;
}) {
  const navigate = useNavigate();
  const logout = useLogout();

  const onLogout = async () => {
    await logout.mutateAsync();
    navigate({ to: "/login" });
  };

  return (
    <>
      <div className="px-6 pt-7 pb-8">
        <NavLink to="/" closeOnNavigate={closeOnNavigate} className="flex items-center gap-2.5">
          <img
            src="/icon-192.png"
            alt="Mise"
            className="size-9 rounded-xl object-contain"
            width={36}
            height={36}
          />
          <div>
            <div className="text-display text-xl leading-none">Mise</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
              Kitchen OS
            </div>
          </div>
        </NavLink>
      </div>

      <nav className="px-3 flex-1 space-y-0.5">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              closeOnNavigate={closeOnNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <HouseholdSwitcher active={household} />

      <div className="mt-auto flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <div
          className="size-8 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold text-white"
          style={{ backgroundColor: user.avatarColor }}
        >
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{user.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          disabled={logout.isPending}
          title="Sign out"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  );
}

function NavLink({
  closeOnNavigate,
  ...props
}: React.ComponentProps<typeof Link> & { closeOnNavigate?: boolean }) {
  const link = <Link {...props} />;

  if (!closeOnNavigate) return link;
  return <SheetClose asChild>{link}</SheetClose>;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
  inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1 sm:flex-none", className)}>
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 w-full sm:w-64 rounded-full border border-input bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/40",
          inputClassName,
        )}
      />
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex shrink-0 items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium whitespace-nowrap hover:opacity-90 transition"
    >
      <Plus className="size-4" />
      {children}
    </button>
  );
}
