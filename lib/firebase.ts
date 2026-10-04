import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type DocumentData, type Firestore } from "firebase/firestore";
import { isLevel, makeReportKey } from "./status";
import type { Report } from "./types";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

function createFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (!isFirebaseConfigured()) return null;
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
}

export const firebase = createFirebase();

type TimestampLike = { toMillis?: () => number };

export function parseReports(data: DocumentData): Record<string, Report> {
  const rawReports = (data.reports ?? {}) as Record<
    string,
    { uid?: unknown; filaKey?: unknown; level?: unknown; ts?: TimestampLike }
  >;
  const reports: Record<string, Report> = {};

  for (const [key, report] of Object.entries(rawReports)) {
    if (!report || !isLevel(report.level)) continue;
    if (typeof report.uid !== "string" || typeof report.filaKey !== "string") continue;
    if (!report.uid || !report.filaKey) continue;
    if (key !== makeReportKey(report.uid, report.filaKey)) continue;
    const ts =
      report.ts && typeof report.ts.toMillis === "function" ? report.ts.toMillis() : null;
    if (ts == null || !Number.isFinite(ts)) continue;
    reports[key] = {
      uid: report.uid,
      filaKey: report.filaKey,
      level: report.level,
      ts,
    };
  }

  return reports;
}
