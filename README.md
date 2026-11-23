# SEC Quality Audit

A Total Quality Management (TQM) Quality Circle check-in and Affinity Board (KJ method) web application for **Surigao Education Center (SEC)** in Surigao City.

## Architecture Overview

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 (`Plus Jakarta Sans` UI, `Patrick Hand` sticky notes).
- **Authentication**: Firebase Authentication (Google Sign-In).
- **Database**: Cloud Firestore (browser reads/writes user-owned records directly under `firestore.rules`; server never writes to Firestore and holds no service account key).
- **Backend API**: Express server (`server/app.ts`) verifying Firebase ID tokens on the server with `jose` against Google's published Firebase signing keys (the method Firebase documents for hosts where the Admin SDK cannot run), reading Firestore via the caller's own ID token (`documents.get` and `runQuery`), and calling `@google/genai` with the 4-model fallback ladder (`gemini-3.6-flash` -> `gemini-3.1-flash-lite` -> `gemini-flash-latest` -> `gemini-3.7-flash`).
- **Deterministic Math**: `shared/boardMath.ts` computes all note counts, theme heat levels, Circle Wall totals, and standard rollups.

---

## Live Deployment Used for This Project: Vercel

Because this project runs without Google Cloud billing, the live deployment runs on **Vercel (Hobby plan)** directly from GitHub:

1. **Import GitHub Repository into Vercel**
   - In the Vercel dashboard, click **Add New Project** and import your GitHub repository.
   - Vercel automatically uses `vercel.json` (`buildCommand: "npm run build"`, `outputDirectory: "dist"`, `functions.api/index.ts.maxDuration: 60`, and rewrites for `/api/(.*)` -> `/api` and `/(.*)` -> `/index.html`).

2. **Configure Sensitive Environment Variables in Vercel**
   - Open **Project Settings -> Environment Variables** and add (marked **Sensitive**):
     - `GEMINI_API_KEY`: Your Gemini API key.
     - `ADMIN_EMAIL`: The super administrator Google email address.
     - `FORCE_MODEL_FAILURE` (optional): `"false"` (set `"true"` only when testing the fallback ladder).

3. **Authorize Your Vercel Domain in Firebase Authentication**
   - Open the **Firebase Console -> Authentication -> Settings -> Authorized domains**.
   - Add your `your-app.vercel.app` domain (and any custom domain) so Google Sign-In popups succeed in production.

4. **Provision the Super Admin Marker Document in Firestore**
   - Sign in once with the `ADMIN_EMAIL` Google account.
   - Copy the UID shown in the on-screen Setup Card and create `/admins/{uid}` in the Firestore Console with `{ role: "superadmin" }`.

5. **Redeploy on Every Push**
   - Every push to the connected GitHub branch automatically rebuilds the static frontend and redeploys the `/api` serverless function.

*(The Cloud Run steps below apply whenever a billing-enabled Google Cloud project is available. Notice `npm start` runs `NODE_ENV=production tsx server.ts` with `tsx` in `dependencies`, so it works even after `devDependencies` are pruned.)*

---

## Environment & Prerequisites (Google Cloud Run Path)

1. Install the [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install) and [Firebase CLI](https://firebase.google.com/docs/cli).
2. Authenticate and set your project:
   ```bash
   gcloud auth login
   gcloud config set project <YOUR_PROJECT_ID>
   ```
3. Enable the required Google Cloud APIs:
   ```bash
   gcloud services enable \
     run.googleapis.com \
     secretmanager.googleapis.com \
     firestore.googleapis.com \
     cloudbuild.googleapis.com
   ```

---

## Secret Management Setup

Never hardcode API keys or secrets in code or `.env` files committed to Git. Create secrets in Google Cloud Secret Manager and grant your Cloud Run runtime service account read access:

```bash
# Create and populate GEMINI_API_KEY
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Create and populate ADMIN_EMAIL
gcloud secrets create ADMIN_EMAIL --replication-policy="automatic"
echo -n "admin@example.edu.ph" | gcloud secrets versions add ADMIN_EMAIL --data-file=-

# Grant the Cloud Run service account access to read secrets
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding ADMIN_EMAIL \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Database Security Configuration

Ensure Cloud Firestore is provisioned and deploy `firestore.rules` (which enforces owner-bound isolation, immutable messages, admin read-only access to user boards, and `/admins/{uid}` verification):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

*(See `firestore.rules` in this repository for the full hardened ruleset covering `/users/{userId}`, `circleSessions`, `interactions`, `settings/companyBasis`, `wallReports`, and `admins/{uid}`.)*

Deploy the rules and indexes to your named Firestore database:
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## Cloud Run Deployment Flow

Build the frontend bundle and deploy the unified Express server (`npm start`) to Cloud Run with Secret Manager bindings:

```bash
npm ci --omit=dev
npm run build

gcloud run deploy sec-quality-audit \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,ADMIN_EMAIL=ADMIN_EMAIL:latest
```

---

## Required Campaign Labeling

Apply the mandatory resource label to register the Cloud Run service for challenge verification:

```bash
gcloud run services update <SERVICE_NAME> \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=<REGION>
```

---

## Local Development

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:3000`.
