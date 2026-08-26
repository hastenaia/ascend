"use client"
import dynamic from "next/dynamic"

function ChartFallback({ height }: { height: number }) {
  return <div className="skeleton w-full rounded-lg" style={{ height }} aria-hidden />
}

/**
 * Lazy barrel: Recharts (~100KB+) loads only when Analytics is visited.
 * SSR kept on — recharts renders server-side fine and avoids client CLS.
 */
export const XpHistoryChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.XpHistoryChart),
  { ssr: true, loading: () => <ChartFallback height={200} /> },
)
export const WeeklyActivityChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.WeeklyActivityChart),
  { ssr: true, loading: () => <ChartFallback height={180} /> },
)
export const MonthlyActivityChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.MonthlyActivityChart),
  { ssr: true, loading: () => <ChartFallback height={160} /> },
)
export const CategoryChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.CategoryChart),
  { ssr: true, loading: () => <ChartFallback height={190} /> },
)
export const StatsRadar = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.StatsRadar),
  { ssr: true, loading: () => <ChartFallback height={230} /> },
)
export const SkillsChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.SkillsChart),
  { ssr: true, loading: () => <ChartFallback height={190} /> },
)
export const MomentumTrendChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.MomentumTrendChart),
  { ssr: true, loading: () => <ChartFallback height={170} /> },
)
