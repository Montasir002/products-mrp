// ============================================================
//  app.js — Core Firebase Config & Secure Asset Pipeline
//  !! SUBSTITUTE ALL PLACEHOLDERS BEFORE DEPLOYING !!
// ============================================================

import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc }
                               from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase Configuration ───────────────────────────────
// !! REPLACE with your Firebase project's configuration object !!
// Found at: Firebase Console → Project Settings → Your Apps → SDK setup
const firebaseConfig = {
  apiKey: "AIzaSyDFZ8EaODgfm8PMMuWfc3zHd8sqzC_8UEI",
  authDomain: "product-mrp.firebaseapp.com",
  projectId: "product-mrp",
  storageBucket: "product-mrp.firebasestorage.app",
  messagingSenderId: "381421078963",
  appId: "1:381421078963:web:ada5d795b141fe562d63c6"
};

// ── GitHub Image Repo Configuration ─────────────────────
// !! REPLACE with your GitHub username and image-hosting repo name !!
export const GH_USERNAME = "Montasir002";   // e.g. "johndoe"
export const GH_REPO     = "image-database";   // e.g. "grocery-images"

// ── Initialize Firebase ──────────────────────────────────
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ────────────────────────────────────────────────────────
//  loadGitHubToken()
//  Reads GitHub PAT from Firestore 'config/github' doc
//  and stores it in sessionStorage for the current tab only.
//  Call this immediately after a successful Firebase login.
//
//  Firestore document path: config/github
//  Required field:          pat  (string — your GitHub Personal Access Token)
//
//  GitHub PAT must have: Contents (Read & Write) permission on YOUR_IMAGE_REPO_NAME
// ────────────────────────────────────────────────────────
export async function loadGitHubToken() {
  try {
    const ref  = doc(db, "config", "github");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      throw new Error("Firestore document 'config/github' not found. Create it with a 'pat' field.");
    }

    const { pat } = snap.data();
    if (!pat || pat.trim() === "") {
      throw new Error("GitHub PAT is empty. Add your token to 'config/github.pat' in Firestore.");
    }

    // Store in sessionStorage — cleared when the tab/browser is closed
    sessionStorage.setItem("gh_pat", pat.trim());
    console.log("[app.js] GitHub token loaded into session.");
    return true;

  } catch (err) {
    console.error("[app.js] loadGitHubToken failed:", err.message);
    throw err; // Re-throw so the caller can show a UI error
  }
}

// ────────────────────────────────────────────────────────
//  uploadImageToGitHub(file, fileName)
//
//  1. Converts the File object to a Base64 string via FileReader
//  2. PUTs the content to GitHub API (creates file in repo)
//  3. Returns a permanent jsDelivr CDN URL string
//
//  Parameters:
//    file     — File object from <input type="file">
//    fileName — Desired filename with extension (e.g. "apple.jpg")
//               The function appends a timestamp to avoid collisions.
//
//  Returns:
//    Promise<string>  — jsDelivr URL like:
//    "https://cdn.jsdelivr.net/gh/USERNAME/REPO@main/images/apple_1718000000.jpg"
// ────────────────────────────────────────────────────────
export async function uploadImageToGitHub(file, fileName) {
  const pat = sessionStorage.getItem("gh_pat");
  if (!pat) {
    throw new Error("GitHub token not loaded. Please re-login.");
  }

  // ── Build a collision-safe filename ─────────────────
  const ext       = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
  const baseName  = fileName
    .replace(/\.[^/.]+$/, "")          // strip extension
    .replace(/\s+/g, "_")              // spaces → underscores
    .replace(/[^a-zA-Z0-9_\-]/g, ""); // remove special chars
  const timestamp = Date.now();
  const safeFile  = `${baseName}_${timestamp}.${ext}`;
  const apiPath   = `images/${safeFile}`;

  // ── Convert file to Base64 ───────────────────────────
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]); // strip data:...;base64,
    reader.onerror = () => reject(new Error("FileReader failed to read image."));
    reader.readAsDataURL(file);
  });

  // ── PUT to GitHub Contents API ───────────────────────
  const apiUrl  = `https://api.github.com/repos/${GH_USERNAME}/${GH_REPO}/contents/${apiPath}`;
  const payload = {
    message: `Add product image: ${safeFile}`,
    content: base64
  };

  const response = await fetch(apiUrl, {
    method:  "PUT",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Content-Type":  "application/json",
      "Accept":        "application/vnd.github+json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`GitHub upload failed (${response.status}): ${errData.message || "Unknown error"}`);
  }

  // ── Build jsDelivr CDN URL ───────────────────────────
  // jsDelivr serves GitHub files globally with high availability
  const cdnUrl = `https://cdn.jsdelivr.net/gh/${GH_USERNAME}/${GH_REPO}@main/${apiPath}`;
  console.log("[app.js] Image uploaded. CDN URL:", cdnUrl);
  return cdnUrl;
}
