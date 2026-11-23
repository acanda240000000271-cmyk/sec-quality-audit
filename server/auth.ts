import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'express';
import { FIREBASE_PROJECT_ID } from './firebaseIds.js';
import { getDocument } from './firestoreRest.js';

function getAdminAuth() {
  const app = getApps().length ? getApp() : initializeApp({ projectId: FIREBASE_PROJECT_ID });
  return getAuth(app);
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
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      displayName: typeof decoded.name === 'string' && decoded.name.trim() ? decoded.name.trim() : 'Staff Member',
      email: typeof decoded.email === 'string' ? decoded.email : '',
      emailVerified: decoded.email_verified === true,
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
