/** Enlaces de navegación, compartidos por el sidebar (Nav) y el drawer móvil (MobileNav). */
export const NAV_LINKS = [
  { href: "/", label: "Overview", icon: "📊" },
  { href: "/prs", label: "PR Board", icon: "🔀" },
  { href: "/contributors", label: "Contributors", icon: "👥" },
  { href: "/discord", label: "Discord", icon: "💬" },
  { href: "/conflicts", label: "Conflicts", icon: "⚔️" },
  { href: "/alerts", label: "Alerts", icon: "🔔" },
  { href: "/issues", label: "Issues", icon: "🐛" },
  { href: "/system", label: "System", icon: "⚙️" },
] as const;
