const configuredDomain = String(process.env.WEB_DEPLOYMENT_DOMAIN || "nasotc.com")
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .split(/[/?#]/, 1)[0]
  .replace(/\.$/, "");

export const WEB_DEPLOYMENT_DOMAIN = /^[a-z0-9.-]+$/.test(configuredDomain)
  ? configuredDomain
  : "nasotc.com";

export const WEB_DEPLOYMENT_STORAGE_MB = 500;
export const WEB_DEPLOYMENT_STORAGE_BYTES = WEB_DEPLOYMENT_STORAGE_MB * 1024 * 1024;

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "autoconfig",
  "autodiscover",
  "dashboard",
  "ftp",
  "host",
  "mail",
  "mailer",
  "mailers",
  "nasotc",
  "ns1",
  "ns2",
  "pop",
  "smtp",
  "status",
  "support",
  "webmail",
  "www",
]);

export function normalizeWebDeploymentSlug(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function validateWebDeploymentSlug(value: unknown): { slug: string; error?: string } {
  const slug = normalizeWebDeploymentSlug(value);
  if (!slug) return { slug, error: "Choose a subdomain for your website." };
  if (slug.length > 63 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    return { slug, error: "Use 1–63 lowercase letters, numbers, or hyphens; start and end with a letter or number." };
  }
  if (RESERVED_SLUGS.has(slug)) return { slug, error: "That subdomain is reserved. Please choose another." };
  return { slug };
}

export function webDeploymentUrl(slug: string): string {
  return `https://${normalizeWebDeploymentSlug(slug)}.${WEB_DEPLOYMENT_DOMAIN}`;
}

export function webDeploymentSlugFromHost(host: string): string | null {
  const hostname = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  const suffix = `.${WEB_DEPLOYMENT_DOMAIN}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  if (slug.includes(".")) return null;
  const checked = validateWebDeploymentSlug(slug);
  return checked.error ? null : checked.slug;
}
