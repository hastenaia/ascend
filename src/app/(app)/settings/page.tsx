import { PageTransition } from "@/components/feedback/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "Settings — Ascend" }

export default function SettingsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Preferences for your Ascend workspace.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Light, dark, or system. Your choice persists.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <Label>Theme</Label>
              <ThemeToggle />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
              <CardDescription>Supabase Auth — email and Google OAuth.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Auth provider</span>
                <Badge variant="soft">Supabase</Badge>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Google OAuth requires Supabase Dashboard → Auth → Providers → Google enabled plus Google Cloud OAuth credentials.
                Until then the “Continue with Google” button shows a helpful not-configured message.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ascend mechanic</CardTitle>
            <CardDescription>Goal → Phase → Milestones → Quests → XP → Skills → Stats → Final Challenge → Completion → Next Phase</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">This is the central loop. Foundation only — no fake data, no placeholder mutations.</p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  )
}
