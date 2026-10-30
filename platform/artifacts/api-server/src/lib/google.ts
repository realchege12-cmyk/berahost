import crypto from "crypto";

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleIdentity = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
};

function clientId() { return process.env.GOOGLE_CLIENT_ID?.trim() || ""; }
function clientSecret() { return process.env.GOOGLE_CLIENT_SECRET?.trim() || ""; }

export function googleConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function googleCallbackUrl(request?: { protocol: string; get(name: string): string | undefined }): string {
  const configured = process.env.PUBLIC_URL || process.env.FRONTEND_URL || "https://berahost-bfer3udn.manus.space";
  const origin = configured || (request ? `${request.protocol}://${request.get("host") || "localhost"}` : "");
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function googleAuthorizationUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<string> {
  if (!googleConfigured()) throw new Error("Google sign-in is not configured on BERAHOST yet.");
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || "Google authorization failed");
  return String(body.access_token);
}

export async function getGoogleIdentity(accessToken: string): Promise<GoogleIdentity> {
  const response = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || !body.sub || !body.email) throw new Error("Google did not return a verified email identity.");
  return {
    id: String(body.sub),
    email: String(body.email).toLowerCase(),
    name: body.name ? String(body.name) : null,
    avatarUrl: body.picture ? String(body.picture) : null,
    emailVerified: body.email_verified === true,
  };
}

export function googleState(): string { return crypto.randomBytes(24).toString("hex"); }
