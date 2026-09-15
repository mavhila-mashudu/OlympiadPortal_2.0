import { clearToken } from "./api";
import { clearStudentProfile } from "./student";
import { getSupabaseClient } from "./supabase";

// Exam progress kept on the device (see pages/student/examStorage.ts). It
// belongs to the signed-in student, so it must not carry over to whoever
// uses this computer next.
const USER_STORAGE_PREFIXES = ["exam-answers-", "exam-flags-"];

function clearUserStorage() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && USER_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable — nothing to clear
  }
}

// Signs the user out of this browser: the API token, cached profile and
// on-device exam progress go immediately, and the Supabase session is ended
// in the background (the app no longer knows the user, so there's no need to
// wait on the network).
export function logout() {
  clearToken();
  clearStudentProfile();
  clearUserStorage();
  try {
    getSupabaseClient()
      .auth.signOut({ scope: "local" })
      .catch(() => {});
  } catch {
    // Supabase isn't configured — there is no session to end
  }
}
