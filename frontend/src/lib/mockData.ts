import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Award,
  Building2,
  ClipboardList,
  FileCheckCorner,
  FilePlusCorner,
  LayoutDashboard,
  UserPlus,
} from "lucide-react";

export type RoundStatus = "closed" | "open" | "upcoming";

export type OlympiadRound = {
  id: string;
  title: string;
  opens: string;
  closes: string;
  status: RoundStatus;
  schools: number;
  submissions: number;
  educatorNote: string;
  primaryAction?: boolean;
  secondaryAction?: string;
};

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
};

export type ArchiveEntry = {
  id: string;
  round: string;
  closed: string;
  paper: string;
  memo: string;
};

export type EducatorContact = {
  name: string;
  role: string;
  email: string;
};

export type School = {
  name: string;
  district: string;
  entrants: number;
  educators: EducatorContact[];
};

export type ResultRow = {
  rank: number;
  name: string;
  studentNumber: string;
  grade: number;
  score: string;
  percentage: string;
};

export const rounds: OlympiadRound[] = [
  {
    id: "r-2026-01",
    title: "Round 1 — Qualifier",
    opens: "Jul 09, 2026, 12:40 PM",
    closes: "Jul 10, 2026, 12:40 PM",
    status: "closed",
    schools: 42,
    submissions: 40,
    educatorNote: "Submission: auto-marked",
    secondaryAction: "View results",
  },
  {
    id: "r-2026-02",
    title: "Round 2 — Semi-final",
    opens: "Jul 24, 2026, 12:40 PM",
    closes: "Jul 25, 2026, 12:40 PM",
    status: "closed",
    schools: 38,
    submissions: 36,
    educatorNote: "Submission: auto-marked",
    secondaryAction: "View results",
  },
  {
    id: "r-2026-03",
    title: "Round 3 — Regional",
    opens: "Aug 08, 2026, 10:40 AM",
    closes: "Aug 09, 2026, 10:40 AM",
    status: "open",
    schools: 35,
    submissions: 12,
    educatorNote: "Closes in",
    primaryAction: true,
  },
  {
    id: "r-2026-04",
    title: "Round 4 — National Final",
    opens: "Aug 11, 2026, 12:40 PM",
    closes: "Aug 12, 2026, 12:40 PM",
    status: "upcoming",
    schools: 18,
    submissions: 0,
    educatorNote: "Opens in",
    secondaryAction: "Register entrants",
  },
];

export const organiserNav: NavItem[] = [
  { label: "Dashboard", to: "/organiser", icon: LayoutDashboard },
  { label: "Create round", to: "/organiser/rounds/new", icon: FilePlusCorner },
  { label: "Paper archive", to: "/organiser/archive", icon: Archive },
  { label: "Schools & educators", to: "/organiser/schools", icon: Building2 },
];

export const educatorNav: NavItem[] = [
  { label: "Dashboard", to: "/educator", icon: LayoutDashboard },
  { label: "Results", to: "/educator/results", icon: ClipboardList },
  { label: "Register entrants", to: "/educator/entrants", icon: UserPlus },
];

export const stats = [
  {
    label: "Schools registered",
    value: "5",
    helper: "Across all rounds",
    icon: Building2,
  },
  {
    label: "Submissions received",
    value: "6",
    helper: "All rounds to date",
    icon: FileCheckCorner,
  },
  {
    label: "Rounds currently open",
    value: "1",
    helper: "Accepting submissions",
    icon: FilePlusCorner,
  },
];

export const archiveEntries: ArchiveEntry[] = [
  {
    id: "r-2026-01",
    round: "Round 1 — Qualifier",
    closed: "Jul 10, 2026",
    paper: "olympiad-round-1-qualifier.pdf",
    memo: "olympiad-round-1-memo.pdf",
  },
  {
    id: "r-2026-02",
    round: "Round 2 — Semi-final",
    closed: "Jul 25, 2026",
    paper: "olympiad-round-2-semifinal.pdf",
    memo: "olympiad-round-2-memo.pdf",
  },
];

export const schools: School[] = [
  {
    name: "Rosebank High School",
    district: "Johannesburg North",
    entrants: 24,
    educators: [
      {
        name: "Thandi Mokoena",
        role: "Head of Mathematics",
        email: "t.mokoena@rosebankhs.edu",
      },
      {
        name: "Pieter van Wyk",
        role: "Olympiad Coordinator",
        email: "p.vanwyk@rosebankhs.edu",
      },
    ],
  },
  {
    name: "Table View Secondary",
    district: "Cape Town West",
    entrants: 18,
    educators: [
      {
        name: "Aisha Patel",
        role: "Science Teacher",
        email: "a.patel@tableview.edu",
      },
    ],
  },
  {
    name: "Bloem Grey College",
    district: "Mangaung",
    entrants: 31,
    educators: [
      {
        name: "Johan Steyn",
        role: "Deputy Principal",
        email: "j.steyn@bloemgrey.edu",
      },
    ],
  },
  {
    name: "Durban Girls' College",
    district: "eThekwini",
    entrants: 22,
    educators: [
      {
        name: "Nomsa Dlamini",
        role: "Olympiad Coordinator",
        email: "n.dlamini@dgc.edu",
      },
    ],
  },
  {
    name: "Polokwane Academy",
    district: "Capricorn",
    entrants: 14,
    educators: [
      {
        name: "Kabelo Rathebe",
        role: "Mathematics Teacher",
        email: "k.rathebe@polokwaneacademy.edu",
      },
    ],
  },
];

export const resultRows: ResultRow[] = [
  {
    rank: 1,
    name: "Daniel Fourie",
    studentNumber: "RHS-1207",
    grade: 12,
    score: "91 / 100",
    percentage: "91%",
  },
  {
    rank: 2,
    name: "Lerato Nkosi",
    studentNumber: "RHS-1104",
    grade: 11,
    score: "82 / 100",
    percentage: "82%",
  },
  {
    rank: 3,
    name: "Sipho Radebe",
    studentNumber: "RHS-1233",
    grade: 12,
    score: "67 / 100",
    percentage: "67%",
  },
];

export type StudentRoundResult = {
  score: string;
  percentage: string;
  rankInSchool: number;
  hasCertificate: boolean;
};

export type StudentRound = {
  id: string;
  title: string;
  opens: string;
  closes: string;
  status: RoundStatus;
  note: string;
  countdown?: string;
  paperFile?: string;
  paperNote?: string;
  result?: StudentRoundResult;
};

export const studentNav: NavItem[] = [
  { label: "Dashboard", to: "/student", icon: LayoutDashboard },
];

export const studentStats = [
  {
    label: "Rounds entered",
    value: "3",
    helper: "This olympiad year",
    icon: ClipboardList,
  },
  {
    label: "Results available",
    value: "1",
    helper: "Released to you",
    icon: FileCheckCorner,
  },
  {
    label: "Certificates earned",
    value: "1",
    helper: "Top-3 school placings",
    icon: Award,
  },
];

export const studentRounds: StudentRound[] = [
  {
    id: "r-2026-01",
    title: "Round 1 — Qualifier",
    opens: "Jul 16, 2026, 07:52 PM",
    closes: "Jul 17, 2026, 07:52 PM",
    status: "closed",
    note: "Your score: 82 / 100 · Certificate available",
    paperFile: "olympiad-round-1-qualifier.pdf",
    paperNote: "This round has closed.",
    result: {
      score: "82 / 100",
      percentage: "82%",
      rankInSchool: 2,
      hasCertificate: true,
    },
  },
  {
    id: "r-2026-02",
    title: "Round 2 — Semi-final",
    opens: "Jul 31, 2026, 07:52 PM",
    closes: "Aug 01, 2026, 07:52 PM",
    status: "closed",
    note: "Results not released yet",
    paperFile: "olympiad-round-2-semifinal.pdf",
    paperNote: "This round has closed.",
  },
  {
    id: "r-2026-04",
    title: "Round 4 — National Final",
    opens: "Aug 18, 2026, 07:52 PM",
    closes: "Aug 19, 2026, 07:52 PM",
    status: "upcoming",
    note: "Opens in",
    countdown: "2d 23h 55m",
    paperFile: "olympiad-round-4-national-final.pdf",
    paperNote: "Available when the round opens.",
  },
];
