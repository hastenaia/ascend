import {
  LayoutDashboard,
  ScrollText,
  Target,
  Route,
  Sparkles,
  Flag,
  BarChart3,
  Trophy,
  FlaskConical,
  Bot,
  Settings2,
  Activity,
  type LucideIcon,
} from "lucide-react"

export type NavGroup = "overview" | "progression" | "development" | "system"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  group: NavGroup
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "overview", description: "Your command center" },
  { label: "Current Phase", href: "/phase", icon: Target, group: "progression", description: "Phase progress" },
  { label: "Journey", href: "/journey", icon: Route, group: "progression", description: "Your path" },
  { label: "Quests", href: "/quests", icon: ScrollText, group: "progression", description: "Active quests" },
  { label: "Character", href: "/stats", icon: Activity, group: "progression", description: "Stats and attributes" },
  { label: "Skills", href: "/skills", icon: Sparkles, group: "progression", description: "Skill tree" },
  { label: "Achievements", href: "/achievements", icon: Trophy, group: "progression", description: "Milestones" },
  { label: "Goals", href: "/goals", icon: Flag, group: "development", description: "Long-term goals" },
  { label: "Experiments", href: "/experiments", icon: FlaskConical, group: "development", description: "Trials" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, group: "development", description: "Insights" },
  { label: "AI Coach", href: "/coach", icon: Bot, group: "development", description: "Guidance" },
  { label: "Settings", href: "/settings", icon: Settings2, group: "system", description: "Preferences" },
]

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  overview: "Overview",
  progression: "Progression",
  development: "Development",
  system: "System",
}

export const MOBILE_PRIMARY_HREFS = ["/dashboard", "/phase", "/quests", "/journey", "/coach"] as const
