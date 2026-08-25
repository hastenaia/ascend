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
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  group: "primary" | "growth" | "system"
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "primary", description: "Overview & momentum" },
  { label: "Quests", href: "/quests", icon: ScrollText, group: "primary", description: "Active quests" },
  { label: "Current Phase", href: "/phase", icon: Target, group: "primary", description: "Phase progress" },
  { label: "Journey", href: "/journey", icon: Route, group: "primary", description: "Your path" },
  { label: "Skills", href: "/skills", icon: Sparkles, group: "growth", description: "Skill tree" },
  { label: "Goals", href: "/goals", icon: Flag, group: "growth", description: "Long-term goals" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, group: "growth", description: "Insights" },
  { label: "Achievements", href: "/achievements", icon: Trophy, group: "growth", description: "Milestones" },
  { label: "Experiments", href: "/experiments", icon: FlaskConical, group: "system", description: "Trials" },
  { label: "AI Coach", href: "/coach", icon: Bot, group: "system", description: "Guidance" },
  { label: "Settings", href: "/settings", icon: Settings2, group: "system", description: "Preferences" },
]

export const MOBILE_PRIMARY_HREFS = ["/dashboard", "/quests", "/phase", "/journey", "/coach"] as const
