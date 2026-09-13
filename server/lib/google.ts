import { createHash } from 'node:crypto';
import { env } from './env.js';
import { newToken } from './id.js';
import { z } from 'zod';

/* ทำ OAuth เองด้วย fetch ธรรมดา ไม่ใช้ไลบรารี เพราะ flow มีแค่สองขั้นและการพึ่ง
   ไลบรารีสำหรับเรื่องความปลอดภัยแปลว่าต้องตามอัปเดตมันตลอด
   ใช้ Authorization Code พร้อม PKCE และ state เพื่อกัน CSRF กับการดักโค้ด */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export function redirectUri() {
  return `${env.appOrigin}/api/auth/google/callback`;
}

export function newPkcePair() {
  const verifier = newToken();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeUrl(state: string, challenge: string) {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // ขอให้เลือกบัญชีทุกครั้ง คนใช้เครื่องร่วมกันจะได้ไม่ติดบัญชีคนก่อน
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export async function exchangeCode(code: string, verifier: string) {
  const response = await fetch(TOKEN_ENDPOINT, {
    signal: AbortSignal.timeout(10000),
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(),
    }),
  });
  if (!response.ok) throw new Error(`google token exchange failed: ${response.status}`);
  return z.object({ access_token: z.string().min(1) }).parse(await response.json());
}

const profileSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(200),
  email_verified: z.boolean(),
  name: z.string().max(200).optional(),
  picture: z.string().url().refine(value => value.startsWith('https://')).optional(),
  hd: z.string().min(1).optional(),
});
export type GoogleProfile = z.infer<typeof profileSchema>;

export async function fetchProfile(accessToken: string) {
  const response = await fetch(USERINFO_ENDPOINT, {
    signal: AbortSignal.timeout(10000),
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`google userinfo failed: ${response.status}`);
  return profileSchema.parse(await response.json());
}
