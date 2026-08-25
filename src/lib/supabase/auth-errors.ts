export function mapAuthError(raw: string | null | undefined): string {
  if (!raw) return "Something went wrong. Please try again."
  const m = raw.toLowerCase()

  if (m.includes("invalid login credentials") || m.includes("invalid login")) {
    return "Incorrect email or password."
  }
  if (m.includes("email not confirmed")) {
    return "Check your email to confirm your account, then try again."
  }
  if (m.includes("user already registered") || m.includes("already registered") || m.includes("user already exists")) {
    return "Account already exists. Try signing in."
  }
  if (m.includes("email rate limit") || m.includes("too many requests") || m.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again."
  }
  if (m.includes("password should be at least") || m.includes("password is too short")) {
    return "Password does not meet requirements."
  }
  if (m.includes("expired") || m.includes("otp expired") || m.includes("token expired")) {
    return "Your link has expired. Request a new one."
  }
  if (m.includes("callback_failed") || m.includes("exchange") || m.includes("code verifier")) {
    return "Authentication failed. Please try signing in again."
  }
  if (m.includes("provider is not enabled") || m.includes("provider not enabled") || m.includes("oauth")) {
    return "Google sign-in isn't configured yet. Use email/password for now."
  }
  if (m.includes("email address is invalid") || m.includes("invalid email")) {
    return "Enter a valid email address."
  }
  if (m.includes("network") || m.includes("fetch failed") || m.includes("supabase unavailable")) {
    return "Service temporarily unavailable. Please try again."
  }
  // Fallback: sanitize but show trimmed raw without stack
  const trimmed = raw.trim()
  if (trimmed.length > 180) return trimmed.slice(0, 180) + "…"
  return trimmed
}

export function getAuthErrorFromSearchParams(sp: URLSearchParams): string | null {
  const direct = sp.get("error_description") || sp.get("error") || sp.get("message")
  if (!direct) return null
  return mapAuthError(direct)
}
