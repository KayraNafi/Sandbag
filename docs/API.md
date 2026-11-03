# Sandbag API

Read and write your own workouts from scripts and other tools.

Create a key in the app under **Settings → API keys**. It's shown once. Send it as a bearer token:

```sh
curl https://sandbag.novaden.dev/api/v1/me -H "Authorization: Bearer sbk_..."
```

On your own server, swap in your own domain.

## What a key can do

A key reaches `/v1` only, and only your own data. It can't change your password or account, see your friends, or post
for you. Deleting a key, or changing your password, stops it immediately. Keep it out of anything you share.

Limits: 300 requests a minute per client, and 60 a minute for `POST /v1/workouts`. A `429` means slow down.

Errors look like `{ "error": "workouts.0.entries.0.rpe: Too big..." }`, naming the field at fault.

Names and text are cleaned as they arrive: put on one line, with invisible characters removed. Text with nothing visible in it is refused. A set beyond the all-time records, or with zero reps, is stored as sent but doesn't count towards scores, bests or calls.

## Workouts

### `POST /v1/workouts`

Adds or replaces up to 500 workouts in one request, all or nothing.

```json
{
  "workouts": [
    {
      "id": "log-2026-01-15",
      "date": "2026-01-15",
      "title": "Upper",
      "entries": [
        { "name": "Cable curls", "sets": 3, "reps": 8, "weight": 11.3, "rpe": 8, "note": "last set 13.6" },
        { "name": "Rope", "kind": "time", "minutes": 5 }
      ]
    }
  ]
}
```

Only `date` and each entry's `name` are required.

| Workout field | Default | Notes |
|---|---|---|
| `id` | generated | Letters, numbers, `_` and `-`. Send your own and a rerun replaces instead of duplicating, so a failed import is safe to retry. |
| `date` | required | `YYYY-MM-DD`. Past dates are fine, the future isn't. |
| `title` | `Workout` | |
| `savedWorkoutId` | `null` | Counts this workout in that saved workout's rotation. |
| `entries` | required | 1 to 100. |

| Entry field | Default | Notes |
|---|---|---|
| `name` | required | Matched without regard to case or small typos, and common names are recognised, so `flat bench` and `Bench press` share a history. |
| `kind` | `strength` | Or `time`. |
| `sets`, `reps` | `null` | |
| `setReps` | not set | Reps for each set when they differ, like `[8, 8, 6]`. Up to 20, one per set. |
| `setWeights` | not set | Weight for each set when they differ, like `[60, 70, 80]`. `weight` should be the heaviest. |
| `weight` | `null` | Kilograms. |
| `perSide` | `false` | The weight is per side. |
| `includesEquipment` | not set | `true` if the weight counts the bar or machine, `false` if it doesn't. Leave it out to say neither. |
| `rpe` | `null` | 0 to 10. |
| `minutes` | `null` | For `time`. |
| `note` | empty | Up to 200 characters. |

Returns `201` with `{ "created": 1, "updated": 0, "ids": ["log-2026-01-15"] }`. The app picks it up on its next sync.

Imports count towards your history, streaks and trophies by their date. A backdated workout can't answer a sandbag call made
after it, and one written more than 8 days after its date can't be the number your progress is measured against.

### `GET /v1/workouts?after=0&limit=100`

Your workouts in the order they were last written, up to 500 a page. If `nextCursor` isn't null, pass it as `after` for the
next page.

### `DELETE /v1/workouts/:id`

Returns `204`, or `404` if it doesn't exist.

## Saved workouts

- `GET /v1/saved-workouts` lists them in rotation order.
- `POST /v1/saved-workouts` takes `{ "id"?, "name", "exercises": [{ "name", "kind"?, "sets"?, "reps"? }] }`. Sending an existing
  `id` replaces it, keeping its place in the rotation.
- `DELETE /v1/saved-workouts/:id` removes one.

## You

`GET /v1/me` returns your id, username, display name and weekly target. A changed target starts the following Monday.
