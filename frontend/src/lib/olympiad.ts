export type Olympiad = {
  id: string;
  name: string;
  description?: string;
  _count?: {
    school_registrations?: number;
    rounds?: number;
  };
};

export function getCurrentOlympiad(): Olympiad | null {
  const stored = localStorage.getItem("currentOlympiad");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}