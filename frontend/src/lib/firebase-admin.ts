import * as admin from "firebase-admin";

if (!admin.apps.length) {
  // We rely on Application Default Credentials (ADC) for local development
  // and the Cloud Run service account for production.
  // Therefore, we don't pass any specific credentials object to initializeApp.
  admin.initializeApp({
    storageBucket: "egonair-stream-prod.firebasestorage.app",
  });
}

export const bucket = admin.storage().bucket();
export default admin;
