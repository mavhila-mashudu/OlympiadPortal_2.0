# Public Developer API Reference (v1)

This is the read-only public API for olympiad and competition data. It is intended for school websites, dashboards, widgets, and other public-facing integrations.

- Base URL: `https://olympiad-portal-api.azurewebsites.net/public/v1`
- Local dev URL: `http://localhost:3000/public/v1`
- Access: `GET` only
- Auth: not required
- CORS: allowed for any browser origin

## Overview

The public API exposes non-personal data such as:
- olympiad listings
- round and calendar information
- school rankings and aggregate results
- released papers and memos

It does not expose:
- student names or personal details
- individual answers or marks
- private organiser data
- protected account information

## Which endpoint to use for which information

| If you need… | Use this endpoint |
| --- | --- |
| Overall platform stats | `GET /public/v1/stats` |
| Year-by-year totals | `GET /public/v1/stats/yearly` |
| Recent activity and upcoming rounds | `GET /public/v1/activity` |
| Rounds within a date range | `GET /public/v1/calendar` |
| Search for olympiads, schools, or rounds | `GET /public/v1/search` |
| List of olympiads | `GET /public/v1/olympiads` |
| Details for one olympiad | `GET /public/v1/olympiads/:olympiadId` |
| Aggregate released results for one round | `GET /public/v1/olympiads/:olympiadId/rounds/:roundId/results` |
| Results per school for one released round | `GET /public/v1/olympiads/:olympiadId/rounds/:roundId/results/by-school` |
| Leaderboard for one olympiad | `GET /public/v1/olympiads/:olympiadId/leaderboard` |
| Top schools overall | `GET /public/v1/schools/top` |
| Directory of schools | `GET /public/v1/schools` |
| Details for one school | `GET /public/v1/schools/:schoolId` |
| Released papers and memos | `GET /public/v1/papers` |
| Download a paper or memo | `GET /public/v1/papers/:paperId/download` |

## Response format

Every response follows this envelope:

```json
{
  "success": true,
  "data": { ... }
}
```

Errors follow this shape:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

## Common rules

- Responses are cacheable for a short time: `Cache-Control: public, max-age=60, stale-while-revalidate=300`
- Rate limit: 300 requests per 15-minute window per IP
- If the limit is exceeded, the API returns `429 Too Many Requests`
- Query parameters for listing endpoints:
  - `page` (default `1`)
  - `limit` (default `20`, max `100`)
  - `search`
  - `year`
  - `sort`

Paginated responses usually include:

```json
{
  "page": 1,
  "limit": 10,
  "total": 42,
  "totalPages": 5
}
```

## Endpoint summary

| Endpoint | Purpose |
| --- | --- |
| `GET /public/v1/stats` | Platform totals |
| `GET /public/v1/stats/yearly` | Year-by-year totals |
| `GET /public/v1/activity` | Recent competition activity |
| `GET /public/v1/calendar` | Rounds in a date range |
| `GET /public/v1/search` | Search olympiads, schools, and rounds |
| `GET /public/v1/olympiads` | List olympiads |
| `GET /public/v1/olympiads/:olympiadId` | One olympiad and its rounds |
| `GET /public/v1/olympiads/:olympiadId/rounds/:roundId/results` | Aggregate result statistics |
| `GET /public/v1/olympiads/:olympiadId/rounds/:roundId/results/by-school` | Results by school |
| `GET /public/v1/olympiads/:olympiadId/leaderboard` | School leaderboard for one olympiad |
| `GET /public/v1/schools/top` | Top schools across the platform |
| `GET /public/v1/schools` | School directory |
| `GET /public/v1/schools/:schoolId` | One school profile |
| `GET /public/v1/papers` | Released papers and memos |
| `GET /public/v1/papers/:paperId/download` | Download a paper or memo |

## Example responses

### `GET /public/v1/stats`

```json
{
  "success": true,
  "data": {
    "totalOlympiads": 4,
    "totalRounds": 11,
    "totalSchools": 23,
    "totalStudents": 612,
    "totalSubmissions": 1480
  }
}
```

### `GET /public/v1/olympiads`

```json
{
  "success": true,
  "data": {
    "olympiads": [
      {
        "id": "7a35c24e-4f12-4217-b715-e23a49f50e82",
        "name": "South African Computer Olympiad 2026",
        "year": 2026,
        "roundCount": 3,
        "registeredSchoolCount": 45
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 4,
      "totalPages": 1
    }
  }
}
```

### `GET /public/v1/olympiads/:olympiadId/rounds/:roundId/results`

```json
{
  "success": true,
  "data": {
    "roundId": "4b9e8312-3490-4811-9a7f-712c9802e3b1",
    "totalParticipants": 284,
    "averageScore": 68.4,
    "medianScore": 72.0,
    "highestScore": 98.0,
    "lowestScore": 24.0,
    "scoreDistribution": {
      "0-20": 0,
      "21-40": 18,
      "41-60": 62,
      "61-80": 140,
      "81-100": 64
    }
  }
}
```

## Error codes

| Status | Meaning |
| --- | --- |
| `400` | Invalid request or data not available for that request |
| `404` | Resource not found |
| `422` | Malformed UUID or invalid query parameter |
| `429` | Rate limit exceeded |
| `502` | Paper storage or downstream service error |

## Example usage

### JavaScript

```js
const res = await fetch('https://olympiad-portal-api.azurewebsites.net/public/v1/schools/top?limit=5');
const { success, data, error } = await res.json();

if (!success) {
  throw new Error(error);
}

console.log(data);
```

### cURL

```bash
curl "https://olympiad-portal-api.azurewebsites.net/public/v1/stats"
curl "https://olympiad-portal-api.azurewebsites.net/public/v1/olympiads?limit=10"
```

## Notes

- Use the full versioned path: `/public/v1`, not `/public`
- The API is intentionally read-only and public
- Results endpoints are only available once the relevant round has been released publicly
- Only aggregate and released data is returned; no personal learner data is exposed
