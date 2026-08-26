"use client"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { AnalyticsBundle } from "@/lib/analytics/queries"

const AXIS = { fontSize: 10, fill: "hsl(var(--muted-foreground))" }
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
  color: "hsl(var(--foreground))",
}

/** Q: "How much XP have I gained — and when did I gain it?" */
export function XpHistoryChart({ data }: { data: AnalyticsBundle["xpSeries"] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={5} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={54} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v)} XP`, "Total"]} />
        <Area type="monotone" dataKey="xp" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#xpFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Q: "Is my activity increasing?" */
export function WeeklyActivityChart({ data }: { data: AnalyticsBundle["weekly"] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v)}`, "Completions"]} />
        <Bar dataKey="completions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Monthly long view */
export function MonthlyActivityChart({ data }: { data: AnalyticsBundle["monthly"] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v)}`, "Completions"]} />
        <Bar dataKey="completions" fill="hsl(var(--primary)/0.55)" radius={[4, 4, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Q: "Which areas am I working on most?" */
export function CategoryChart({ data }: { data: AnalyticsBundle["categories"] }) {
  const rows = data.map((d) => ({ ...d, category: d.category.charAt(0).toUpperCase() + d.category.slice(1) }))
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 14, left: 10, bottom: 0 }}>
        <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="category" width={72} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v)}`, "Completed"]} />
        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Q: "Where is my character strongest?" */
export function StatsRadar({ data }: { data: AnalyticsBundle["stats"] }) {
  const rows = data.map((d) => ({ ...d, stat: d.stat.charAt(0).toUpperCase() + d.stat.slice(1) }))
  return (
    <ResponsiveContainer width="100%" height={230}>
      <RadarChart data={rows} outerRadius="72%">
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis dataKey="stat" tick={AXIS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.28} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

/** Q: "Which skills have I invested in most?" */
export function SkillsChart({ data }: { data: AnalyticsBundle["skills"] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(150, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 0 }}>
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="skill" width={110} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v)} XP`, "Invested"]} />
        <Bar dataKey="xp" fill="hsl(var(--gold))" radius={[0, 4, 4, 0]} maxBarSize={13} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Q: "How has my momentum moved?" */
export function MomentumTrendChart({ data }: { data: AnalyticsBundle["momentum"] }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={3} />
        <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={38} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v)}/100`, "Momentum"]} />
        <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2.2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
