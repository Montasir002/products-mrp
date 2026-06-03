// ============================================================
//  app.js — Core Firebase Config & Secure Asset Pipeline
// ============================================================

import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc }
                               from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// !! REPLACE with your Firebase project config !!
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// !! REPLACE with your GitHub username and image repo !!
export const GH_USERNAME = "YOUR_GITHUB_USERNAME";
export const GH_REPO     = "YOUR_IMAGE_REPO_NAME";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ────────────────────────────────────────────────────────
//  loadGitHubToken()
//  Reads PAT from Firestore 'config/github' doc and stores
//  it in sessionStorage. Called after login AND silently
//  on every page if the token is missing from session.
// ────────────────────────────────────────────────────────
export async function loadGitHubToken() {
  try {
    const snap = await getDoc(doc(db, "config", "github"));
    if (!snap.exists()) throw new Error("Firestore doc 'config/github' not found.");
    const { pat } = snap.data();
    if (!pat || !pat.trim()) throw new Error("PAT field is empty in Firestore.");
    sessionStorage.setItem("gh_pat", pat.trim());
    console.log("[app.js] GitHub token loaded.");
    return true;
  } catch (err) {
    console.error("[app.js] loadGitHubToken failed:", err.message);
    throw err;
  }
}

// ────────────────────────────────────────────────────────
//  ensureGitHubToken()
//  Call this on any page that may need the PAT.
//  If the token is already in sessionStorage, does nothing.
//  If missing (e.g. user navigated directly or tab resumed),
//  silently re-fetches it from Firestore in the background.
//  No re-login required.
// ────────────────────────────────────────────────────────
export async function ensureGitHubToken() {
  if (sessionStorage.getItem("gh_pat")) return; // already loaded
  console.log("[app.js] PAT missing from session — re-fetching from Firestore…");
  await loadGitHubToken();
}

// ────────────────────────────────────────────────────────
//  uploadImageToGitHub(file, fileName)
//  Converts image to Base64, PUTs to GitHub API,
//  returns permanent jsDelivr CDN URL.
// ────────────────────────────────────────────────────────
export async function uploadImageToGitHub(file, fileName) {
  // Always ensure token is available before uploading
  await ensureGitHubToken();

  const pat = sessionStorage.getItem("gh_pat");
  if (!pat) throw new Error("GitHub token unavailable. Please log out and log back in.");

  // Collision-safe filename
  const ext      = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
  const baseName = fileName.replace(/\.[^/.]+$/, "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
  const safeFile = `${baseName}_${Date.now()}.${ext}`;
  const apiPath  = `images/${safeFile}`;

  // Convert to Base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

  // PUT to GitHub Contents API
  const response = await fetch(
    `https://api.github.com/repos/${GH_USERNAME}/${GH_REPO}/contents/${apiPath}`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Content-Type":  "application/json",
        "Accept":        "application/vnd.github+json"
      },
      body: JSON.stringify({ message: `Add product image: ${safeFile}`, content: base64 })
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`GitHub upload failed (${response.status}): ${err.message || "Unknown error"}`);
  }

  return `https://cdn.jsdelivr.net/gh/${GH_USERNAME}/${GH_REPO}@main/${apiPath}`;
}
