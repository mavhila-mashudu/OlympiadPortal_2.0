# UI Design — Olympiad Portal

> **Team:** Prompt Engineers
> **Version:** 1.0
> **Last updated:** September 2026

---

## 1. Design Approach

### Lovable for UI Prototyping

We used [Lovable](https://olympiad-console-ui.lovable.app) as our primary UI design tool. Lovable is an AI-powered platform that generates modern, visually polished React interfaces from natural language descriptions.

**Why Lovable:**

1. **Non-generic, visually appealing output.** Unlike traditional wireframing tools that produce flat mockups, Lovable generates production-quality components with proper spacing, typography hierarchy, and colour contrast.

2. **Rapid iteration.** Design changes that take hours in Figma are done in minutes by describing the change to Lovable.

3. **Design-to-code.** Lovable outputs React/TypeScript components that we adapted into our own component library, eliminating the typical handoff gap between design and development.

4. **Built-in dark mode.** Every screen was generated in both light and dark variants.

### Supplementary Tools

| Tool                  | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| Lovable               | UI prototyping and component generation                    |
| Figma                 | UML diagrams, flowcharts, ERD visualisation                |
| Lucide React          | Icon library (1400+ icons, tree-shakeable, uniform stroke) |
| CSS Custom Properties | Design token system with OKLCH colour space                |

---

## 2. Design System

### Colour Palette (OKLCH Colour Space)

OKLCH provides perceptually uniform colours — colours at the same lightness value appear equally bright, unlike HSL.

**Light mode:**

| Token              | Value           | Usage                                   |
| ------------------ | --------------- | --------------------------------------- |
| --background       | 98.5% 0.002 250 | Page background                         |
| --foreground       | 21% 0.02 255    | Primary text                            |
| --primary          | 48% 0.13 253    | Buttons, links, focus rings (deep blue) |
| --secondary        | 95.8% 0.006 250 | Secondary buttons, tags                 |
| --muted-foreground | 48% 0.02 256    | Placeholders, secondary text            |
| --destructive      | 53% 0.2 27      | Errors, delete actions (red)            |
| --border           | 90% 0.008 255   | Dividers and card borders               |

**Status colours:**

| Token             | Value        | Usage                      |
| ----------------- | ------------ | -------------------------- |
| --status-open     | 50% 0.12 155 | Round is open (green)      |
| --status-upcoming | 55% 0.13 70  | Round is scheduled (amber) |
| --status-closed   | 48% 0.02 256 | Round is closed (grey)     |

**Chart colours:** Five distinct hues chosen for accessibility (distinguishable under colour blindness): warm orange, teal, blue-grey, yellow-green, lime.

**Dark mode:** Triggered by a `.dark` class. Background shifts to 12.9% lightness, primary lightness increases to 65% for visibility, borders become semi-transparent white.

### Typography

| Level           | Weight          | Usage                         |
| --------------- | --------------- | ----------------------------- |
| Page title      | Bold (700)      | Dashboard and page headers    |
| Section heading | Semi-bold (600) | Card titles                   |
| Body            | Regular (400)   | Content, labels, descriptions |
| Small           | Regular (400)   | Timestamps, helper text       |
| Mono            | Monospace       | Invitation codes, IDs         |

### Spacing and Layout

- Base border radius: 0.5rem (8px)
- Sidebar: 260px on desktop, icon-only on tablet, hidden behind hamburger on mobile
- Content area: max-width container with comfortable reading width
- Spacing based on 4px (0.25rem) increments

---

## 3. Component Library

### UI Primitives

| Component   | File                          | Description                                                    |
| ----------- | ----------------------------- | -------------------------------------------------------------- |
| Button      | components/ui/Button.tsx      | Primary, secondary, destructive, ghost variants; loading state |
| Card        | components/ui/Card.tsx        | Container with border and optional header/footer               |
| Input       | components/ui/Input.tsx       | Text input with label, error state, focus ring                 |
| Label       | components/ui/Label.tsx       | Form label with consistent typography                          |
| Select      | components/ui/Select.tsx      | Dropdown with chevron icon                                     |
| Textarea    | components/ui/Textarea.tsx    | Multi-line text input                                          |
| FileInput   | components/ui/FileInput.tsx   | Drag-and-drop file upload with preview                         |
| Table       | components/ui/Table.tsx       | Responsive data table with horizontal scroll on mobile         |
| StatusBadge | components/ui/StatusBadge.tsx | Coloured pill badge for round and submission states            |

### Layout Components

| Component  | File                             | Description                                            |
| ---------- | -------------------------------- | ------------------------------------------------------ |
| AppShell   | components/layout/AppShell.tsx   | Sidebar + header + content area; role-aware navigation |
| PageHeader | components/layout/PageHeader.tsx | Page title, breadcrumbs, action buttons                |

---

## 4. Page Designs

### Authentication Pages

**Login page (/login):** Centred card on subtle background. Fields for email, password, and a role selector (Organiser/Educator/Student) as tabbed pills. "Forgot password" link and "Create account" link below the submit button.

**Signup page (/signup):** Same centred card layout. Fields for full name, email, password (with requirements helper text: min 8 chars, uppercase, number), and invitation code with an inline "Verify code" button that shows the school and olympiad details before confirming registration.

### Organiser Pages

**Dashboard (/organiser):** Four stat cards (Total Olympiads, Active Rounds, Registered Schools, Papers Uploaded) followed by a table of active rounds with columns for name, olympiad, state badge, and close date.

**Olympiads (/organiser/olympiads):** Table listing all olympiads. "Create Olympiad" button opens a modal with name and timezone fields.

**Create Round (/organiser/rounds/new):** Form with round name, olympiad selector, opens_at and closes_at date-time pickers, optional qualifying threshold, and file upload sections for paper and memo PDFs.

**Schools (/organiser/schools):** Table of registered schools for the selected olympiad. "Invite School" button opens a form for school name and contact email. Shows invitation status (pending, accepted, expired).

**Archive (/organiser/archive):** Searchable list of past papers across all olympiads with download links.

### Educator Pages

**Dashboard (/educator):** Three stat cards (Entrants, Active Rounds, Results) followed by a table of current rounds with action buttons, and a recent results summary table.

**Entrants (/educator/entrants):** Table of school entrants with "Add Entrant" form (full name, grade) and bulk actions for round registration. "Generate Student Codes" button for bulk login code creation.

**Round Detail (/educator/rounds/:id):** Round info header with state badge and dates. Paper download button (when round is open). Submission form as a table of entrants with score inputs.

**Results (/educator/results):** Filterable table by round showing entrant name, score, rank, and qualified status.

### Student Pages

**Dashboard (/student):** Three stat cards (Rounds Entered, Best Score, Overall Rank) followed by a table of rounds with state, score, and rank columns.

**Round Detail (/student/rounds/:id):** When open: timer bar, question-by-question interface with answer inputs (radio for MCQ, text for short answer), flag-for-review toggle, question navigator, and submit button. When results released: score summary, per-question breakdown, and "Request Remark" button.

**Results (/student/results):** All personal results across rounds and olympiads with certificate download links for qualified rounds.

---

## 5. Key User Flows

**Organiser creates a competition:** Login > Olympiads > Create Olympiad > Invite School > Create Round > Upload Paper > Wait for auto-open > Mark Submissions > Generate Results > Papers auto-archived.

**Educator registers and submits:** Receive invitation email > Signup with code > Verify school details > Create account > Add Entrants > Register for round > Download paper (when open) > Upload results > View scores (when released).

**Student sits a paper online:** Receive code from educator > Signup > See open round > Click round > Timer starts (server-calculated) > Answer questions with auto-save > Flag difficult questions > Submit > View results later > Download certificate if qualified.

---

## 6. Responsive Design

| Breakpoint          | Sidebar                    | Tables              |
| ------------------- | -------------------------- | ------------------- |
| Desktop (1024px+)   | Full width, always visible | All columns shown   |
| Tablet (768-1023px) | Icon-only, expand on click | Horizontal scroll   |
| Mobile (<768px)     | Hidden, hamburger toggle   | Card layout per row |

---

## 7. Accessibility

| Aspect              | Implementation                                               |
| ------------------- | ------------------------------------------------------------ |
| Colour contrast     | All text meets WCAG AA 4.5:1 in both modes                   |
| Focus indicators    | Visible ring on all interactive elements                     |
| Semantic HTML       | nav for sidebar, main for content, table for data            |
| ARIA labels         | Icon-only buttons have aria-label; badges have role="status" |
| Keyboard navigation | All elements reachable via Tab; forms submittable via Enter  |
| Touch targets       | Minimum 44px for mobile                                      |

---

## 8. Interactive Prototype

The complete interactive prototype is available at: [https://olympiad-console-ui.lovable.app](https://olympiad-console-ui.lovable.app)

This demonstrates the login page with role selector, all three dashboards, dark mode, and responsive sidebar navigation.

---
