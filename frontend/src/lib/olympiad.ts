import { api } from "./api";

export type Olympiad = {
  id: string;
  name: string;
  organiser_id: string;
  created_at: string;
  _count?: { rounds: number; school_registrations: number };
};

// Not cached in localStorage on purpose: olympiads are organiser-scoped, so a
// cached id from a previous account would 403 under a new one.
// Returns null when no olympiads exist — callers should prompt the user to create one.
export async function getCurrentOlympiad(): Promise<Olympiad | null> {
  const { olympiads } = await api.get<{ olympiads: Olympiad[] }>("/olympiads");
  if (olympiads.length > 0) return olympiads[0];
  return null;
}
