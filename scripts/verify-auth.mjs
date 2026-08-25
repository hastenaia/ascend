import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fpspwpmxlnfsegcwqeir.supabase.co"
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_f66j5apLYTqJs7IE1vHAlw_ZphpVRTI"

async function test() {
  console.log("[verify] URL", url)
  const anon = createClient(url, key)
  const rand = Math.random().toString(36).slice(2,8)
  const email = `ascend_test_${rand}@example.com`
  const password = `TestPass123!${rand}`

  console.log("[verify] attempting signUp", email)
  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${url}/auth/callback`, data: { display_name: "TestUser" } }
  })
  console.log("[verify] signUp error", error ? error.message : "none")
  console.log("[verify] signUp data user", data?.user?.id, "session", !!data?.session)
  if (error) {
    console.log("[verify] signUp raw", error)
  }

  // Try to query phase_templates (should fail 404 if migration not applied)
  const { data: tmpl, error: tmplErr } = await anon.from("phase_templates").select("*").order("order_index")
  console.log("[verify] phase_templates select status", tmplErr ? tmplErr.message : `found ${tmpl?.length} rows`, tmplErr?.code)
  if (tmpl) console.log("[verify] templates", tmpl.map(t=>t.slug))

  // Try profiles select for anon (should be 0 or error)
  const { data: profAnon, error: profAnonErr } = await anon.from("profiles").select("*").limit(1)
  console.log("[verify] profiles anon select", profAnonErr ? profAnonErr.message : `rows ${profAnon?.length}`, profAnonErr?.code)

  // If we got a user, try authenticated query with that user's client (use session if exists)
  if (data?.user && data?.session) {
    const authed = createClient(url, key, { global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } })
    // Need to set auth via supabase.auth.setSession
    await authed.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
    const { data: prof, error: profErr } = await authed.from("profiles").select("*").eq("id", data.user.id).maybeSingle()
    console.log("[verify] own profile", profErr ? profErr.message : JSON.stringify(prof), profErr?.code)
  } else {
    console.log("[verify] no session (email confirm ON) — cannot test authenticated profile fetch without confirming email")
    console.log("[verify] checking auth settings: mailer_autoconfirm false means confirm required")
  }

  // Test invalid login mapping
  const { error: badLogin } = await anon.auth.signInWithPassword({ email: "nope@example.com", password: "wrongpass123" })
  console.log("[verify] invalid login error", badLogin?.message)

  // Test google oauth url generation
  const { data: oauth, error: oauthErr } = await anon.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${url}/auth/callback` } })
  console.log("[verify] google oauth error", oauthErr ? oauthErr.message : "no error (provider not enabled will still return url)", oauth)

  // Cleanup: try sign out
  await anon.auth.signOut()
  console.log("[verify] done")
}

test().catch(e=>{console.error(e); process.exit(1)})
