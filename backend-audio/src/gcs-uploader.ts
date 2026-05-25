/**
 * EGONAIR — GCS Recording Uploader
 * Optional helper: uploads a completed .webm recording to Google Cloud Storage.
 *
 * Activation: set GCS_BUCKET env var. If unset, all upload calls are no-ops.
 * The @google-cloud/storage package must be installed:
 *   npm install @google-cloud/storage
 *
 * GCS credentials are auto-detected via Application Default Credentials (ADC):
 *   - On GCE/Cloud Run: the VM/service account SA is used automatically.
 *   - Locally: run `gcloud auth application-default login` first.
 */

const GCS_BUCKET = process.env.GCS_BUCKET ?? '';
const GCS_PREFIX = process.env.GCS_PREFIX ?? 'recordings';

// Lazy-load the GCS client only if GCS_BUCKET is configured.
// This avoids import errors when @google-cloud/storage is not installed.
let storageClient: any = null;
let bucketRef: any = null;

function getStorage(): any | null {
  if (!GCS_BUCKET) return null;
  if (bucketRef) return bucketRef;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Storage } = require('@google-cloud/storage');
    storageClient = new Storage();
    bucketRef = storageClient.bucket(GCS_BUCKET);
    console.log(`[GCS] Initialized. Bucket: gs://${GCS_BUCKET}/${GCS_PREFIX}/`);
    return bucketRef;
  } catch (err: any) {
    console.warn(`[GCS] @google-cloud/storage not available: ${err.message}`);
    console.warn(`[GCS] Recordings will not be uploaded to GCS.`);
    return null;
  }
}

/**
 * Uploads a local recording file to GCS asynchronously.
 * Fire-and-forget — does not block the WebSocket close handler.
 *
 * @param localFilePath  Absolute path to the local .webm file.
 * @param destFileName   Destination blob name within the bucket (e.g. filename only).
 */
export async function uploadRecordingToGCS(
  localFilePath: string,
  destFileName: string
): Promise<string | null> {
  const bucket = getStorage();
  if (!bucket) return null;  // GCS disabled — silent no-op

  const destPath = `${GCS_PREFIX}/${destFileName}`;
  try {
    await bucket.upload(localFilePath, {
      destination: destPath,
      metadata: {
        contentType: 'audio/webm',
        cacheControl: 'private, max-age=0',
      },
    });
    const gcsUrl = `gs://${GCS_BUCKET}/${destPath}`;
    console.log(`[GCS] Uploaded: ${gcsUrl}`);
    return gcsUrl;
  } catch (err: any) {
    // Non-fatal — log and continue. Local file is still the source of truth.
    console.error(`[GCS] Upload failed for ${destFileName}: ${err.message}`);
    return null;
  }
}
