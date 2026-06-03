import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy } from "firebase/firestore/lite";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

export let db = null;
export let isMock = true;

// Attempt real Firebase initialization if a project ID is present
if (firebaseConfig.projectId && firebaseConfig.projectId.trim() !== "") {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    isMock = false;
    console.log("Firebase Cloud Firestore Lite successfully initialized.");
  } catch (err) {
    console.warn("Failed to initialize Firebase Firestore, falling back to mock mode:", err);
  }
} else {
  console.log("No VITE_FIREBASE_PROJECT_ID found. Operating in local Mock Mode (backed by localStorage).");
}

// Helper to normalize names for duplicate detection
const normalizeName = (name) => {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
};

// ---------------------------------------------------------------------------
// LocalStorage Mock Helpers
// ---------------------------------------------------------------------------
const MOCK_STORAGE_KEY = "akpsi_network_mock_submissions";

function getMockSubmissions() {
  const data = localStorage.getItem(MOCK_STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveMockSubmissions(submissions) {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(submissions));
}

// Seed some initial mock submissions for testing if storage is empty
if (getMockSubmissions().length === 0) {
  saveMockSubmissions([
    {
      id: "mock-1",
      name: "Alex Mercer",
      email: "alex.mercer@gmail.com",
      company: "Deloitte",
      position: "Consultant",
      city: "Chicago",
      linkedin: "https://www.linkedin.com/in/alex-mercer",
      gradYear: 2023,
      verified: false,
      createdAt: Date.now() - 3600000 * 2 // 2 hours ago
    },
    {
      id: "mock-2",
      name: "Sarah Jenkins",
      email: "sjenkins@pwc.com",
      company: "PwC",
      position: "Senior Associate",
      city: "Chicago",
      linkedin: "https://www.linkedin.com/in/sarah-jenkins",
      gradYear: 2021,
      verified: true,
      createdAt: Date.now() - 3600000 * 24 // 1 day ago
    }
  ]);
}

// ---------------------------------------------------------------------------
// Production Database Actions (Unified API)
// ---------------------------------------------------------------------------

/**
 * Submits an alumnus/recruiter candidate from the Update Hub
 */
export async function submitPendingAlumnus(alumnus) {
  const payload = {
    name: alumnus.name.trim(),
    email: alumnus.email.trim(),
    company: alumnus.company.trim(),
    position: alumnus.position.trim(),
    city: alumnus.city.trim(),
    linkedin: alumnus.linkedin.trim(),
    gradYear: alumnus.gradYear ? parseInt(alumnus.gradYear) : null,
    verified: false,
    createdAt: Date.now(),
    isRecruiter: !!alumnus.isRecruiter
  };

  if (isMock) {
    const list = getMockSubmissions();
    const newEntry = { ...payload, id: "mock-" + Math.random().toString(36).substr(2, 9) };
    list.push(newEntry);
    saveMockSubmissions(list);
    window.dispatchEvent(new Event("localSubmissionsUpdate"));
    return newEntry.id;
  } else {
    const ref = collection(db, "pending_submissions");
    const docRef = await addDoc(ref, payload);
    window.dispatchEvent(new Event("cloudSubmissionsUpdate"));
    return docRef.id;
  }
}

/**
 * Subscribes to updates for APPROVED entries (verified === true)
 */
export function subscribeApprovedSubmissions(onUpdate) {
  if (isMock) {
    const triggerUpdate = () => {
      const list = getMockSubmissions().filter(s => s.verified === true);
      onUpdate(list);
    };
    triggerUpdate();
    const listener = () => triggerUpdate();
    window.addEventListener("storage", listener);
    window.addEventListener("localSubmissionsUpdate", listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("localSubmissionsUpdate", listener);
    };
  } else {
    const fetchApproved = () => {
      const q = query(
        collection(db, "pending_submissions"),
        where("verified", "==", true),
        orderBy("createdAt", "desc")
      );
      getDocs(q).then((snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onUpdate(list);
      }).catch(err => {
        console.error("Firestore approved getDocs error:", err);
      });
    };
    fetchApproved();
    window.addEventListener("cloudSubmissionsUpdate", fetchApproved);
    return () => {
      window.removeEventListener("cloudSubmissionsUpdate", fetchApproved);
    };
  }
}

/**
 * Subscribes to updates for ALL pending entries (verified === false)
 * exclusively for the admin board.
 */
export function subscribePendingSubmissions(onUpdate) {
  if (isMock) {
    const triggerUpdate = () => {
      const list = getMockSubmissions().filter(s => !s.verified);
      onUpdate(list);
    };
    triggerUpdate();
    const listener = () => triggerUpdate();
    window.addEventListener("storage", listener);
    window.addEventListener("localSubmissionsUpdate", listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("localSubmissionsUpdate", listener);
    };
  } else {
    const fetchPending = () => {
      const q = query(
        collection(db, "pending_submissions"),
        where("verified", "==", false),
        orderBy("createdAt", "desc")
      );
      getDocs(q).then((snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onUpdate(list);
      }).catch(err => {
        console.error("Firestore pending getDocs error:", err);
      });
    };
    fetchPending();
    window.addEventListener("cloudSubmissionsUpdate", fetchPending);
    return () => {
      window.removeEventListener("cloudSubmissionsUpdate", fetchPending);
    };
  }
}

/**
 * Promotes a pending submission to verified === true.
 * Implements Identity-Based Merging: Overwrites matching verified records by normalized name
 * and deletes the duplicate pending entry.
 */
export async function approvePendingAlumnus(id) {
  if (isMock) {
    const list = getMockSubmissions();
    const pendingIndex = list.findIndex(s => s.id === id);
    if (pendingIndex === -1) return;
    
    const pendingEntry = list[pendingIndex];
    const pendingNormName = normalizeName(pendingEntry.name);

    // Look for duplicate verified entry
    const duplicateIndex = list.findIndex(
      s => s.verified === true && normalizeName(s.name) === pendingNormName
    );

    if (duplicateIndex !== -1) {
      list[duplicateIndex] = {
        ...pendingEntry,
        id: list[duplicateIndex].id,
        verified: true,
        createdAt: Date.now()
      };
      list.splice(pendingIndex, 1);
    } else {
      pendingEntry.verified = true;
      pendingEntry.createdAt = Date.now();
    }
    
    saveMockSubmissions(list);
    window.dispatchEvent(new Event("localSubmissionsUpdate"));
  } else {
    const pendingRef = doc(db, "pending_submissions", id);
    const pendingSnap = await getDoc(pendingRef);
    if (!pendingSnap.exists()) return;

    const pendingData = pendingSnap.data();
    const pendingNormName = normalizeName(pendingData.name);

    const q = query(
      collection(db, "pending_submissions"),
      where("verified", "==", true)
    );
    const querySnapshot = await getDocs(q);
    
    let duplicateDocId = null;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (normalizeName(data.name) === pendingNormName) {
        duplicateDocId = doc.id;
      }
    });

    if (duplicateDocId) {
      const verifiedRef = doc(db, "pending_submissions", duplicateDocId);
      await updateDoc(verifiedRef, {
        ...pendingData,
        verified: true,
        createdAt: Date.now()
      });
      await deleteDoc(pendingRef);
    } else {
      await updateDoc(pendingRef, {
        verified: true,
        createdAt: Date.now()
      });
    }
    window.dispatchEvent(new Event("cloudSubmissionsUpdate"));
  }
}

/**
 * Permanently deletes a pending submission
 */
export async function deletePendingAlumnus(id) {
  if (isMock) {
    let list = getMockSubmissions();
    list = list.filter(s => s.id !== id);
    saveMockSubmissions(list);
    window.dispatchEvent(new Event("localSubmissionsUpdate"));
  } else {
    const ref = doc(db, "pending_submissions", id);
    await deleteDoc(ref);
    window.dispatchEvent(new Event("cloudSubmissionsUpdate"));
  }
}
