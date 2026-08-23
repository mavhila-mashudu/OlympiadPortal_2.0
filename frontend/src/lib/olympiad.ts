import { api } from "./api";

export type Olympiad = {
  id: string;
  name: string;
  organiser_id: string;
  created_at: string;
  _count?: { rounds: number; school_registrations: number };
};

// Not cached in localStorage on purpose: every dev-login email is a
// different organiser row, and olympiads are organiser-scoped, so a
// cached id from a previous "random email" session would 403 under a
// new one. This is one cheap extra request per page load in exchange
// for never showing/creating the wrong organiser's data.
export async function getCurrentOlympiad(): Promise<Olympiad> {
  const { olympiads } = await api.get<{ olympiads: Olympiad[] }>("/olympiads");
  if (olympiads.length > 0) return olympiads[0];

  const { olympiad } = await api.post<{ olympiad: Olympiad }>("/olympiads", {
    name: "Demo Olympiad",
  });
  return olympiad;
}