import { ConfidentialClientApplication } from "@azure/msal-node";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required configuration: ${name}.`);
  return value;
}

export function authorizeClaims(claims: JWTPayload): void {
  if (typeof claims.scp !== "string" || !claims.scp.split(" ").includes("access_as_user")
    || !Array.isArray(claims.roles) || !claims.roles.includes("Bootcamp.Organizer")) {
    throw new Error("Organizer access required.");
  }
}

export function httpAuth(environment: string): {
  tenant: string; clientId: string; verify: (token: string) => Promise<void>; dataverseToken: (token: string) => Promise<string>;
} {
  const tenant = required("MCP_TENANT_ID");
  const clientId = required("MCP_CLIENT_ID");
  if (!/^[0-9a-f-]{36}$/i.test(tenant) || !/^[0-9a-f-]{36}$/i.test(clientId)) throw new Error("Use Entra tenant and client GUIDs.");
  const authority = `https://login.microsoftonline.com/${tenant}`;
  const keys = createRemoteJWKSet(new URL(`${authority}/discovery/v2.0/keys`));
  const msal = new ConfidentialClientApplication({
    auth: { authority, clientId, clientSecret: required("MCP_CLIENT_SECRET") },
  });
  return {
    tenant, clientId,
    verify: async (token: string): Promise<void> => {
      const { payload } = await jwtVerify(token, keys, { issuer: `${authority}/v2.0`, audience: clientId, algorithms: ["RS256"], requiredClaims: ["exp", "iat"] });
      authorizeClaims(payload);
    },
    dataverseToken: async (token: string): Promise<string> => {
      const response = await msal.acquireTokenOnBehalfOf({ oboAssertion: token, scopes: [`${new URL(environment).origin}/.default`] });
      if (!response?.accessToken) throw new Error("Dataverse on-behalf-of authentication failed.");
      return response.accessToken;
    },
  };
}
