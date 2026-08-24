export interface Olympiad {
  id: string;
  name: string;
  created_at?: string;
}

export function getCurrentOlympiad(): Olympiad | null {
  const stored = localStorage.getItem("currentOlympiad");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}