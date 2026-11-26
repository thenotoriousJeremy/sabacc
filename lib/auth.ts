/**
 * Site-wide Authentication, Signed Session Cookies, and Native OIDC (OpenID Connect + PKCE).
 * Supports Authentik, Authelia, Keycloak, Pocket-ID, Google, and standard OIDC providers
 * with zero external npm dependencies.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';

export interface AuthSession {
  sub: string;
  name: string;
  email?: string;
  isAdmin: boolean;
  authMethod: 'password' | 'admin_password' | 'oidc';
  exp: number;
}

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  providerName: string;
  requireAuth: boolean;
  allowedGroup: string;
  adminGroup: string;
  adminEmails: string[];
}

export const AUTH_COOKIE = 'sabacc_auth';
const OIDC_STATE_COOKIE = 'sabacc_oidc_tx';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

const sessionSecret =
  process.env.SESSION_SECRET?.trim() || randomBytes(32).toString('hex');

export function readOidcEnv(): OidcConfig | null {
  const issuerUrl = (process.env.OIDC_ISSUER_URL ?? '').trim().replace(/\/+$/, '');
  const clientId = (process.env.OIDC_CLIENT_ID ?? '').trim();
  if (!issuerUrl || !clientId) return null;

  return {
    issuerUrl,
    clientId,
    clientSecret: (process.env.OIDC_CLIENT_SECRET ?? '').trim(),
    redirectUri: (process.env.OIDC_REDIRECT_URI ?? '').trim(),
    providerName: (process.env.OIDC_PROVIDER_NAME ?? 'SSO').trim() || 'SSO',
    requireAuth: process.env.OIDC_REQUIRE_AUTH === 'true',
    allowedGroup: (process.env.OIDC_ALLOWED_GROUP ?? '').trim(),
    adminGroup: (process.env.OIDC_ADMIN_GROUP ?? '').trim(),
    adminEmails: (process.env.OIDC_ADMIN_EMAILS ?? '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

function signPayload(data: object): string {
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const sig = createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedToken<T extends { exp: number }>(token?: string | null): T | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expected = createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  const bufA = Buffer.from(sig);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function readAuthSessionFromCookieHeader(cookieHeader?: string): AuthSession | null {
  const cookies = parseCookies(cookieHeader);
  return verifySignedToken<AuthSession>(cookies[AUTH_COOKIE]);
}

export function issueSessionCookie(res: Response, req: Request, session: Omit<AuthSession, 'exp'>): void {
  const full: AuthSession = {
    ...session,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const token = signPayload(full);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const isPackagedCrossOrigin =
    origin === 'https://localhost' || origin === 'capacitor://localhost';
  const sameSite = secure && isPackagedCrossOrigin ? 'None' : 'Lax';
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_TTL_SECONDS}${
      secure ? '; Secure' : ''
    }`
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// --- OIDC Discovery & Authorization Code + PKCE Flow ----------------------

interface OidcDiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

let cachedDiscovery: { issuer: string; doc: OidcDiscoveryDoc; at: number } | null = null;

async function discoverOidc(issuerUrl: string): Promise<OidcDiscoveryDoc> {
  if (cachedDiscovery && cachedDiscovery.issuer === issuerUrl && Date.now() - cachedDiscovery.at < 3_600_000) {
    return cachedDiscovery.doc;
  }
  const wellKnown = `${issuerUrl}/.well-known/openid-configuration`;
  const resp = await fetch(wellKnown, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    throw new Error(`OIDC discovery failed (${resp.status}) at ${wellKnown}`);
  }
  const doc = (await resp.json()) as OidcDiscoveryDoc;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error('OIDC discovery document missing authorization_endpoint or token_endpoint');
  }
  cachedDiscovery = { issuer: issuerUrl, doc, at: Date.now() };
  return doc;
}

export function resolveRedirectUri(req: Request, oidc: OidcConfig, configuredPublicUrl: string): string {
  if (oidc.redirectUri) return oidc.redirectUri;
  if (configuredPublicUrl) return `${configuredPublicUrl}/api/auth/oidc/callback`;
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.get('host') || 'localhost:3000';
  return `${proto}://${host}/api/auth/oidc/callback`;
}

export async function beginOidcLogin(
  req: Request,
  res: Response,
  oidc: OidcConfig,
  publicUrl: string
): Promise<void> {
  const doc = await discoverOidc(oidc.issuerUrl);
  const state = randomBytes(18).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = resolveRedirectUri(req, oidc, publicUrl);

  const txToken = signPayload({ state, verifier, redirectUri, exp: Date.now() + 10 * 60 * 1000 });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${OIDC_STATE_COOKIE}=${encodeURIComponent(txToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${
      secure ? '; Secure' : ''
    }`
  );

  const authUrl = new URL(doc.authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', oidc.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid profile email groups');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  res.redirect(authUrl.toString());
}

function decodeJwtPayload(jwt: string): Record<string, any> {
  const parts = jwt.split('.');
  if (parts.length < 2) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

export async function completeOidcCallback(
  req: Request,
  res: Response,
  oidc: OidcConfig
): Promise<void> {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  if (!code || !state) {
    res.status(400).send('Missing OIDC code or state.');
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const tx = verifySignedToken<{ state: string; verifier: string; redirectUri: string; exp: number }>(
    cookies[OIDC_STATE_COOKIE]
  );
  if (!tx || tx.state !== state) {
    res.status(400).send('Invalid or expired OIDC login state. Please try signing in again.');
    return;
  }

  const doc = await discoverOidc(oidc.issuerUrl);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: oidc.clientId,
    code,
    redirect_uri: tx.redirectUri,
    code_verifier: tx.verifier,
  });
  if (oidc.clientSecret) {
    body.set('client_secret', oidc.clientSecret);
  }

  const tokenResp = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!tokenResp.ok) {
    res.status(401).send(`OIDC token exchange failed (${tokenResp.status}).`);
    return;
  }

  const tokens = (await tokenResp.json()) as { id_token?: string; access_token?: string };
  let claims: Record<string, any> = tokens.id_token ? decodeJwtPayload(tokens.id_token) : {};

  if (doc.userinfo_endpoint && tokens.access_token) {
    const uiResp = await fetch(doc.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    });
    if (uiResp.ok) {
      const uiClaims = (await uiResp.json()) as Record<string, any>;
      claims = { ...claims, ...uiClaims };
    }
  }

  const groups: string[] = Array.isArray(claims.groups)
    ? claims.groups.map(String)
    : typeof claims.groups === 'string'
      ? [claims.groups]
      : [];

  if (oidc.allowedGroup && !groups.includes(oidc.allowedGroup)) {
    res.status(403).send(`Access denied: requires group "${oidc.allowedGroup}".`);
    return;
  }

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : undefined;
  const isAdmin =
    (!!oidc.adminGroup && groups.includes(oidc.adminGroup)) ||
    (!!email && oidc.adminEmails.includes(email));

  const rawName =
    claims.preferred_username || claims.name || (email ? email.split('@')[0] : 'Pilot');
  const sub = String(claims.sub || email || rawName);

  issueSessionCookie(res, req, {
    sub,
    name: String(rawName).slice(0, 20),
    email,
    isAdmin,
    authMethod: 'oidc',
  });
  res.redirect('/');
}
