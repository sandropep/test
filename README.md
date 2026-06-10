# ShelfChecker

A React Native mobile app for field representatives to audit retail store shelves and for administrators to track performance across all stores.

## Overview

Field checkers visit assigned stores, rate each position (warehouse, fridge, shelf) and upload photos. Each visit is automatically scored and categorised (A–D). Admins get a dashboard with date-range filters, per-checker/per-shop drilldown, a donut category breakdown chart, and a score trend bar chart.

The UI is in Georgian (ქართული).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Expo](https://expo.dev/) ~52 with Expo Router ~4 |
| Language | TypeScript |
| Backend / Auth | [Supabase](https://supabase.com/) (Postgres + Auth + Storage) |
| Charts | `react-native-svg` (custom DonutChart + TrendBarChart) |
| Image picker | `expo-image-picker` + `expo-file-system` |
| Date picker | `@react-native-community/datetimepicker` |

## Project Structure

```
app/
  _layout.tsx          # Root layout – auth guard & role-based redirect
  index.tsx            # Entry redirect
  (auth)/
    login.tsx          # Email / password login screen
  (checker)/
    index.tsx          # Checker home – today's count + recent visits
    new-visit.tsx      # Create a new visit (shop search, ratings, photos)
    stats.tsx          # Checker personal statistics
    visit/[id].tsx     # View / edit an individual visit
  (admin)/
    index.tsx          # Admin dashboard (charts, summary, filters)
    visits.tsx         # Full visit list for admins
    manage.tsx         # Add/remove shops and checker accounts
    shop/[id].tsx      # Admin shop detail
    visit/[id].tsx     # Admin visit detail
components/
  LogoutButton.tsx
lib/
  supabase.ts          # Supabase client
```

## User Roles

### Checker
- Logs visits to stores by searching shop number or name
- Rates three positions — **საწყობი** (warehouse), **მაცივარი** (fridge), **თარო** (shelf) — as **A** or **B**
- Optionally attaches a photo per position (uploaded to Supabase Storage)
- Adds free-text notes
- Each visit gets a `score_percent` and a category **A / B / C / D** calculated server-side

### Admin
- Dashboard filtered by date range, checker, and shop
- Summary cards: total visits, unvisited stores out of all stores
- Charts: donut (category breakdown) or bar trend (average score over time)
- Manage tab: create/delete shops and checker accounts

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- A Supabase project with the required tables (`users`, `shops`, `visits`) and Storage bucket

### Install

```bash
npm install
```

### Environment

Create a `.env` file (or set `app.config.ts` / `expo-constants` values) with your Supabase credentials:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### Run

```bash
# Start Expo dev server
npm start

# Android
npm run android

# iOS
npm run ios

# Web
npm run web
```

## Scoring Logic

| Category | Score |
|---|---|
| A | ≥ 90% |
| B | ≥ 75% |
| C | ≥ 60% |
| D | < 60% |

## Database Schema (overview)

| Table | Key columns |
|---|---|
| `users` | `id`, `role` (`admin`\|`checker`), `full_name`, `email` |
| `shops` | `id`, `shop_number`, `name`, `location` |
| `visits` | `id`, `shop_id`, `checker_id`, `date`, `score_percent`, `category`, `notes` |
