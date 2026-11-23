import type { Request } from 'express';
import { FIREBASE_PROJECT_ID } from './firebaseIds.js';
import { getDocument } from './firestoreRest.js';

// Firebase ID tokens are verified on the server with jose against Google's
// published Firebase signing keys (the method Firebase documents for hosts where
// the Admin SDK cannot run), loaded via cached dynamic import for CJS/ESM compatibility.
const FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const CLOCK_TOLERANCE_SECONDS = 60;

type JoseModule = typeof import('jose');
let josePromise: Promise<JoseModule> | null = null;
let jwksResolver: ReturnType<JoseModule['createRemoteJWKSet']> | null = null;

async function getJoseVerifier() {
  if (!josePromise) {
    josePromise = import('jose');
  }
  const jose = await josePromise;
  if (!jwksResolver) {
    jwksResolver = jose.createRemoteJWKSet(FIREBASE_JWKS_URL);
  }
  return { jwtVerify: jose.jwtVerify, jwks: jwksResolver };
}

export interface VerifiedCaller {
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  idToken: string;
}

export async function verifyCaller(req: Request): Promise<VerifiedCaller> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header.');
    (err as Error & { statusCode?: number; code?: string }).statusCode = 401;
    (err as Error & { statusCode?: number; code?: string }).code = 'UNAUTHORIZED';
    throw err;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    const err = new Error('Empty Bearer token.');
    (err as Error & { statusCode?: number; code?: string }).statusCode = 401;
    (err as Error & { statusCode?: number; code?: string }).code = 'UNAUTHORIZED';
    throw err;
  }

  try {
    const { jwtVerify, jwks } = await getJoseVerifier();
    const { payload } = await jwtVerify(idToken, jwks, {
      algorithms: ['RS256'],
      issuer: FIREBASE_ISSUER,
      audience: FIREBASE_PROJECT_ID,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number' ||
      payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS ||
      typeof payload.auth_time !== 'number' ||
      payload.auth_time > nowSeconds + CLOCK_TOLERANCE_SECONDS
    ) {
      throw new Error('Invalid token timestamps.');
    }

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.sub.length > 128
    ) {
      throw new Error('Invalid token subject.');
    }

    return {
      uid: payload.sub,
      displayName:
        typeof payload.name === 'string' && payload.name.trim()
          ? payload.name.trim()
          : 'Staff Member',
      email: typeof payload.email === 'string' ? payload.email : '',
      emailVerified: payload.email_verified === true,
      idToken,
    };
  } catch {
    const err = new Error('Invalid or expired authentication token.');
    (err as Error & { statusCode?: number; code?: string }).statusCode = 401;
    (err as Error & { statusCode?: number; code?: string }).code = 'INVALID_TOKEN';
    throw err;
  }
}

export async function checkAdminStatus(caller: VerifiedCaller): Promise<{
  isAdmin: boolean;
  adminSetupNeeded: boolean;
}> {
  const configuredAdminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!configuredAdminEmail) {
    return { isAdmin: false, adminSetupNeeded: false };
  }

  const callerEmail = caller.email.trim().toLowerCase();
  if (!caller.emailVerified || !callerEmail || callerEmail !== configuredAdminEmail) {
    return { isAdmin: false, adminSetupNeeded: false };
  }

  try {
    const adminDoc = await getDocument(`admins/${caller.uid}`, caller.idToken);
    if (adminDoc) {
      return { isAdmin: true, adminSetupNeeded: false };
    }
    return { isAdmin: false, adminSetupNeeded: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 403 || status === 404) {
      return { isAdmin: false, adminSetupNeeded: true };
    }
    throw err;
  }
}
