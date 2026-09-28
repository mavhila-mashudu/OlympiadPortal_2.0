import { api } from "./api";
import { formatDateInZone, formatDateTimeInZone } from "./time";

export type StudentProfile = {
  userName: string;
  userInitials: string;
  organisation: string;
};

let cachedProfile: StudentProfile | null = null;

export async function getStudentProfile(): Promise<StudentProfile> {
  if (cachedProfile) return cachedProfile;

  try {
    const { user } = await api.get<{
      user: {
        full_name: string;
        entrants?: {
          schools?: {
            name: string;
          };
        };
        school_memberships?: {
          schools?: {
            name: string;
          };
        }[];
      };
    }>("/auth/me");

    const name = user.full_name || "Student";
    const initials =
      name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0].toUpperCase())
        .slice(0, 2)
        .join("") || "ST";

    const school =
      user.entrants?.schools?.name ||
      user.school_memberships?.[0]?.schools?.name ||
      "Olympiad School";

    cachedProfile = {
      userName: name,
      userInitials: initials,
      organisation: school,
    };
    return cachedProfile;
  } catch {
    return {
      userName: "Student",
      userInitials: "ST",
      organisation: "Olympiad Portal",
    };
  }
}

// Forget the cached profile, so the next student to sign in on this tab
// doesn't see the previous student's name and school
export function clearStudentProfile() {
  cachedProfile = null;
}

export function formatCountdown(opensAtIso: string): string {
  const diffMs = new Date(opensAtIso).getTime() - Date.now();
  if (diffMs <= 0) return "Starting soon";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Round times are shown in the olympiad's timezone, labelled
export function formatDateTime(isoString: string, timeZone: string): string {
  if (!isoString) return "—";
  return formatDateTimeInZone(isoString, timeZone);
}

export function formatDateOnly(isoString: string, timeZone: string): string {
  if (!isoString) return "—";
  return formatDateInZone(isoString, timeZone);
}
