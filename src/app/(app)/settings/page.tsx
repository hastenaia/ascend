import { PageTransition } from "@/components/feedback/page-transition"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/server"
import { CoachProfileForm } from "@/components/settings/coach-profile"
import type { CoachStyle, ProfileExperienceLevel, ProfilePreferences } from "@/types/database"

export const metadata = { title: "Settings — Ascend" }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile = {
    experience_level: null as ProfileExperienceLevel | null,
    long_term_objectives: null as string | null,
    coach_style: null as CoachStyle | null,
  }
  if (user) {
    const { data } = await supabase.from("profiles").select("experience_level, long_term_objectives, preferences").eq("id", user.id).maybeSingle()
    if (data) {
      profile = {
        experience_level: (data.experience_level as ProfileExperienceLevel | null) ?? null,
        long_term_objectives: (data.long_term_objectives as string | null) ?? null,
        coach_style: ((data.preferences as ProfilePreferences) ?? {}).coachStyle ?? null,
      }
    }
  }

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
            <CardTitle className="text-base">Coach profile</CardTitle>
            <CardDescription>Give your AI coach real context about you — it sharpens quests, plans, and reflections.</CardDescription>
          </CardHeader>
          <CardContent>
            <CoachProfileForm initial={profile} />
          </CardContent>
        </Card>

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
