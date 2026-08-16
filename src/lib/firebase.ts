
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Exportamos los servicios necesarios
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Inicialización de Storage
export const storage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In a real environment, we'd throw a new Error(JSON.stringify(errInfo))
  // but for the user UI, we might want to keep it readable too.
  // The skill says MUST throw JSON string.
  throw new Error(JSON.stringify(errInfo));
}

export const PRIMARY_ADMIN_EMAILS = [
  'sole.petetta@gmail.com',
  'capacitaciones@fundacioncrucianelli.com',
];

export const TEACHER_EMAILS = PRIMARY_ADMIN_EMAILS;

export function isPrimaryAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return PRIMARY_ADMIN_EMAILS.includes(email.toLowerCase());
}

export function isTeacher(email: string | null | undefined): boolean {
  if (!email) return false;
  return PRIMARY_ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function checkTeacherStatus(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const emailLower = email.toLowerCase();
  if (PRIMARY_ADMIN_EMAILS.includes(emailLower)) return true;

  try {
    const teacherDoc = await getDocFromServer(doc(db, 'teachers', emailLower));
    return teacherDoc.exists();
  } catch (error) {
    try {
      const cachedDoc = await getDocFromCache(doc(db, 'teachers', emailLower));
      return cachedDoc.exists();
    } catch {
      return false;
    }
  }
}

if (process.env.NODE_ENV !== 'production') {
  console.log("Firebase inicializado. Proyecto:", firebaseConfig.projectId);
  console.log("Bucket de Storage:", firebaseConfig.storageBucket);
}
