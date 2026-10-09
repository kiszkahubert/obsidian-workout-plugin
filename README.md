# Workout Tracker for Obsidian

Track exercises, build workouts, log your training and chart your progress, all inside Obsidian (desktop and mobile).

## Features

- **Exercises:** name, muscle group, equipment, notes, and one of four types:
  - **Weight × reps** (bench press, squat…)
  - **Bodyweight reps** (pull-ups, push-ups; optional added kg)
  - **Timed** (plank, dead hang)
  - **Cardio** (distance + time, with pace)
- **Workouts (templates):** pick exercises and set targets for each: number of sets, a rep range, weight, time or distance. For example, *Push Day: Bench Press 4 × 6–8 @ 70 kg*.
- **Logging:**
  - Start a workout from a template or from scratch.
  - Every set is **pre-filled from the last time you did that exercise**, falling back to the template target. Tap ✓ to mark a set done.
  - Shows your target and last session above the sets, and a running timer.
  - Sets that beat your previous best get a live 🏆 PR badge.
- **Progress charts:** one chart per exercise, with a choice of metric:
  - Weight × reps: estimated 1RM (Epley), max weight, volume (sets × reps × kg), best set (kg × reps), total reps
  - Bodyweight reps: max reps in a set, total reps
  - Timed: longest set, total time
  - Cardio: distance, duration, pace
  - PR sessions are highlighted, and a table below the chart lists the same data.
- **Personal records:** detected automatically when you beat your previous best for weight, e1RM, reps, time or distance. They show up while logging, in History, on the Dashboard and in workout notes.
- **Dashboard:**
  - Workouts this week and this month, weekly volume, latest bodyweight
  - A 26-week training calendar heatmap
  - Sets per muscle group
  - Recent PRs
- **Time range filter:** 1M / 3M / 6M / 1Y / All on every chart.
- **Bodyweight tracking:** log your weight and see a trend chart.
- **History:** browse past workouts by month, expand them for details, and edit or delete them.
- **Workout notes:** every finished workout also becomes a Markdown note, e.g. `Workouts/2026-10-09 Push Day.md`. It has frontmatter (date, duration, volume, exercises, PR count, `#workout` tag) and a table per exercise, so it works with Dataview, links and daily notes.
- **Charts in your notes:** embed live charts with code blocks (see below).
- **Commands and ribbon icon.** All units are kg.

## Using it

Open the plugin with the dumbbell icon in the ribbon or with **Workout Tracker: Open dashboard**. The view has these tabs:

| Tab | What it's for |
|---|---|
| Dashboard | Overview stats, training calendar, muscle-group volume, recent PRs |
| Log | The workout in progress (or buttons to start one) |
| Workouts | Your workout templates: create, edit, start |
| Exercises | Your exercise library |
| Progress | A chart and table per exercise and metric |
| History | Past workouts: view, edit, delete, open note |
| Body | Bodyweight log and chart |

Typical flow: add exercises, create a workout from them, press **Start**, then fill in and tick off sets and press **Finish workout**. Sets you didn't tick are discarded.

### Commands

- Open dashboard / Open progress charts / Open workout history
- Start workout (opens the running workout if one exists)
- Finish current workout
- Add exercise
- Create workout template
- Log bodyweight

### Charts in notes

````markdown
```workout-chart
exercise: Bench Press
metric: e1rm
range: 6m
```
````

| Option | Values | Default |
|---|---|---|
| `exercise` | exercise name (case-insensitive) | required |
| `metric` | see below | first metric for the type |
| `range` | `1m`, `3m`, `6m`, `1y`, `all` | setting "Default chart range" |
| `height` | chart height in px | `240` |
| `title` | custom title | exercise — metric |

Metric ids:

- Weight × reps: `e1rm`, `max_weight`, `volume`, `best_set`, `total_reps`
- Bodyweight reps: `max_reps`, `total_reps`
- Timed: `max_duration`, `total_duration`
- Cardio: `distance`, `duration`, `pace`

Bodyweight chart:

````markdown
```workout-bodyweight
range: 1y
```
````

Charts update live as you log workouts.

## Where the data lives

- **Plugin data** (`.obsidian/plugins/workout-tracker/data.json`) is the source of truth: exercises, templates, all logged sets, the in-progress workout and bodyweight entries.
- **Workout notes** are generated from that data each time you finish or edit a workout. Manual edits to a note get overwritten on the next edit from History. Use the session's Notes field for comments.
- If a note is deleted or the folder changes, use **Settings → Regenerate workout notes**.

## Settings

- Create a note for each workout (on/off)
- Workout notes folder (default `Workouts`)
- Default chart range
- Week starts on Monday

## Installing

The compiled `main.js` isn't committed, so build it first:

```bash
npm install
npm run build
```

Then copy `main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/workout-tracker/`. Reload Obsidian and enable **Workout Tracker** under Settings → Community plugins.

For development, `npm run dev` rebuilds on every change.
