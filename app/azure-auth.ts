type AzureClaim = { typ?: unknown; val?: unknown };
type AzurePrincipal = {
  auth_typ?: unknown;
  claims?: unknown;
};

export type AzureUser = {
  userId: string;
  displayName: string;
  email: string;
};

const CLAIMS = {
  objectId: [
    "http://schemas.microsoft.com/identity/claims/objectidentifier",
    "oid",
    "sub",
  ],
  tenantId: ["http://schemas.microsoft.com/identity/claims/tenantid", "tid"],
  email: [
    "preferred_username",
    "email",
    "upn",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  ],
  name: [
    "name",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  ],
} as const;

function claimValue(claims: AzureClaim[], names: readonly string[]): string | null {
  for (const name of names) {
    const match = claims.find((claim) => claim.typ === name && typeof claim.val === "string");
    if (typeof match?.val === "string" && match.val.trim()) return match.val.trim();
  }
  return null;
}

/**
 * Only trust the principal header when App Service Authentication is enabled.
 * The WEBSITE_SITE_NAME guard keeps local requests from spoofing Easy Auth.
 */
export function getAzureUser(requestHeaders: Headers): AzureUser | null {
  if (
    process.env.AZURE_AUTH_MODE !== "app-service" ||
    !process.env.WEBSITE_SITE_NAME?.trim() ||
    process.env.WEBSITE_AUTH_ENABLED?.toLowerCase() !== "true"
  ) {
    return null;
  }

  const encodedPrincipal = requestHeaders.get("x-ms-client-principal");
  if (!encodedPrincipal || encodedPrincipal.length > 32_768) return null;

  let principal: AzurePrincipal;
  try {
    principal = JSON.parse(Buffer.from(encodedPrincipal, "base64").toString("utf8")) as AzurePrincipal;
  } catch {
    return null;
  }

  if (
    typeof principal.auth_typ !== "string" ||
    !["aad", "azuread"].includes(principal.auth_typ.toLowerCase())
  ) {
    return null;
  }

  const claims = Array.isArray(principal.claims)
    ? principal.claims.filter((claim): claim is AzureClaim => !!claim && typeof claim === "object")
    : [];
  const tenantId = claimValue(claims, CLAIMS.tenantId);
  const configuredTenant = process.env.AZURE_TENANT_ID?.trim();
  if (!tenantId || !configuredTenant || tenantId !== configuredTenant) return null;

  const principalId =
    requestHeaders.get("x-ms-client-principal-id")?.trim() ||
    claimValue(claims, CLAIMS.objectId);
  if (!principalId || principalId.length > 512) return null;

  const principalName = requestHeaders.get("x-ms-client-principal-name")?.trim();
  const email = claimValue(claims, CLAIMS.email) || principalName || principalId;
  const displayName = claimValue(claims, CLAIMS.name) || principalName || email;

  // Object IDs are tenant-scoped, so include the tenant in the data owner key.
  const userId = `${tenantId}:${principalId}`;
  if (userId.length > 512) return null;

  return {
    userId,
    displayName: displayName.slice(0, 200),
    email: email.slice(0, 320),
  };
}
