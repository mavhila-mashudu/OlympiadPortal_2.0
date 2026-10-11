# Postman Testing & Verification Suite

This document covers how to execute functional and performance tests on the **Olympiad Portal** using the standardized Postman collection and environment configurations.

---

## 1. Test Artifacts

The Postman artifacts are located in the [`postman/`](../postman) directory:

* **[`OlympiadPortal.postman_collection.json`](../postman/OlympiadPortal.postman_collection.json)**: Standard Postman Collection (v2.1 format) covering:
  * **01 Availability & Health**: Liveness probes (`/health`, `/`), cold start benchmarks, and uptime verifications.
  * **02 Public API (Performance Archetypes)**: Unauthenticated public developer endpoints (`/public/v1/stats`, `/public/v1/olympiads`, `/public/v1/schools`, `/public/v1/schools/top`, `/public/v1/activity`, `/public/v1/calendar`, `/public/v1/papers`).
  * **03 Security & Auth Guards**: Verifies that protected routes (`/me`, `/olympiads`) reject unauthenticated callers with clean `401 Unauthorized` responses without crashing.
* **[`OlympiadPortal.postman_environment.json`](../postman/OlympiadPortal.postman_environment.json)**: Environment file configured for the production deployment (`https://olympiad-portal-api.azurewebsites.net`).

---

## 2. Execution Workflows

### Option A: In the Postman Desktop App (GUI & Performance Graphs)

1. Open Postman.
2. Click **File → Import** (or click the **Import** button in the top left).
3. Select `postman/OlympiadPortal.postman_collection.json` and `postman/OlympiadPortal.postman_environment.json`.
4. In the environment dropdown (top right), select **Olympiad Portal — Production (Azure)**.
5. **To run functional test suites:**
   * Click **Olympiad Portal — Official API Collection** → **Run** → **Run Olympiad Portal**.
6. **To run live performance / load tests:**
   * In the Collection Runner, switch to the **Performance** tab.
   * Set **Virtual Users** (e.g. `20` to `50`) and **Duration** (e.g. `1 min`).
   * Choose a load profile (`Ramp up` or `Fixed`).
   * Click **Run** to watch the real-time latency and throughput curves.

---

### Option B: Via Postman CLI (Headless)

Run directly from your terminal in the root repository directory:

```bash
# Run against the deployed Azure production API
postman collection run postman/OlympiadPortal.postman_collection.json

# Run against a local development server
postman collection run postman/OlympiadPortal.postman_collection.json --env-var "baseUrl=http://localhost:3000"
```

---

### Option C: Automated Terminal Load Benchmark (`npm run test:perf`)

For a direct, high-concurrency throughput and latency percentile breakdown (Avg, p50, p95, p99, RPS, error rates) without needing Postman:

```bash
cd backend
npm run test:perf
```

This runs a native benchmark against all core API archetypes and produces formatted summary tables detailing cold-start latency, throughput, and error rates.

---

### Option D: Stress & Crash Resilience Suite (`npm run test:stress`)

To test the rubric criterion **"How often does it crash?"** against malformed inputs, SQL injection strings, JSON bombs, prototype pollution, oversized payloads, and high-concurrency bursts:

```bash
cd backend
npm run test:stress
```

This runs a comprehensive 10-vector resilience battery against the live deployment and performs a post-stress health verification probe to confirm zero process crashes.
