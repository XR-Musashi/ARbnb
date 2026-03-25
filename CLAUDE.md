# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ARbnb** — An AR Indoor Navigation and Spatial Annotation System for Airbnb guests.
Team: Musashi | Trinity College Dublin

Guests use the mobile AR app to navigate unfamiliar rental properties via floating waypoint arrows and proximity-triggered annotation panels anchored to real-world objects. Hosts author these annotations via a web dashboard. Annotations persist across sessions using Google Cloud Anchors.

Primary test device: **Samsung Galaxy S25 Ultra (Android 15, ARCore)**.
Development machine: **Windows 11**.

---

## Repository Structure

```
ARbnb2/
├── AR app/           # Unity 6 project (guest mobile app)
├── backend/          # Node.js REST API + PostgreSQL/PostGIS
├── frontend dash/    # React + Three.js host dashboard
└── ARbnb_Proposal_Musashi-1.pdf
```

---

## Component 1: AR App (Unity)

**Stack:** Unity 6, AR Foundation 6.4.1, ARCore XR Plugin 6.4.1, URP 17.0, XR Interaction Toolkit 3.4.0, Input System 1.19.0

**Key Unity packages** (`AR app/Packages/manifest.json`):
- `com.unity.xr.arfoundation`: 6.4.1
- `com.unity.xr.arcore`: 6.4.1
- `com.unity.xr.arkit`: 6.4.1
- `com.unity.xr.interaction.toolkit`: 3.4.0
- `com.unity.render-pipelines.universal`: 17.4.0

**Scenes:** `AR app/Assets/Scenes/SampleScene.unity` — the single main scene.
**Template assets:** `AR app/Assets/MobileARTemplateAssets/` — contains existing AR plane detection, object placement prefabs, prompt animations, and UI sprites from the Unity AR Mobile template.

**Build for Android:**
- Open project in Unity 6, switch platform to Android
- Build target: ARCore, minimum API 26, target API 35 (S25 Ultra)
- Scripting backend: IL2CPP, ARM64
- Use `File > Build Settings > Build And Run` to deploy to S25 Ultra over USB

**Adding packages:** Use `Window > Package Manager` inside Unity. Never hand-edit `manifest.json` for version-sensitive AR packages.

**Project settings to configure (not yet set):**
- Company Name, Bundle ID (`com.musashi.arbnb`)
- Android Keystore for release builds
- ARCore Extensions (Google Cloud Anchors) must be added via UPM scope: `com.google.ar.core.arfoundation-extensions`

---

## Component 2: Backend (Node.js)

**Stack:** Node.js (Express), PostgreSQL + PostGIS, Supabase (auth + realtime WebSocket), Prisma ORM

**Location:** `backend/`
**Entry point:** `backend/src/index.js`

**Dev commands:**
```bash
cd backend
npm install
npm run dev          # starts with nodemon
npm run db:migrate   # run Prisma migrations
npm run db:seed      # seed test data
npm test             # Jest tests
```

**Key REST endpoints to implement:**
- `POST /api/properties` — create property (host)
- `GET /api/properties/:id/annotations` — fetch all annotations for a property
- `POST /api/properties/:id/annotations` — create annotation with spatial position
- `PUT /api/annotations/:id` — update annotation text/position
- `DELETE /api/annotations/:id` — remove annotation
- `POST /api/anchors` — store Google Cloud Anchor ID against annotation

**Database schema:** PostgreSQL with PostGIS extension. Key tables: `properties`, `annotations` (with `position geometry(PointZ)` for 3D spatial coords), `cloud_anchors`, `sessions`.

**Auth:** Supabase JWT — all host routes require Bearer token. Guest routes use short-lived session tokens scoped to a property.

---

## Component 3: Frontend Dashboard (React)

**Stack:** React 18, Vite, Three.js (for floor plan 3D viewer), TailwindCSS

**Location:** `frontend dash/`

**Dev commands:**
```bash
cd "frontend dash"
npm install
npm run dev          # Vite dev server on localhost:5173
npm run build        # Production build
npm run preview      # Preview production build
npm test             # Vitest
```

**Key views to implement:**
- `/login` — Supabase auth (host login)
- `/dashboard` — list of properties
- `/properties/:id/edit` — floor plan upload + annotation pin editor (Three.js canvas)
- Floor plan editor: upload image → place pins on 2D overlay → each pin has title + text note

---

## Architecture: Data Flow

```
Host (browser)
  └─ React dashboard ──► Node.js API ──► PostgreSQL (annotations + anchors)
                                          │
                                          ▼
Guest (Unity AR app) ──► REST API ──► fetch annotations by property
                    └──► Google Cloud Anchors API ──► resolve spatial anchor
```

- Annotations are authored with 2D floor-plan coordinates in the dashboard.
- On first AR walkthrough, the Unity app resolves Google Cloud Anchors and maps annotation positions to real-world 3D space.
- `ARAnchorManager` handles local anchor lifecycle; `ARCore Extensions` handles cloud sync.
- Proximity culling: max 3 annotation panels visible simultaneously (distance-sorted).

---

## Key Architectural Decisions

- **No marker-based tracking** — uses markerless ARCore SLAM exclusively.
- **Google Cloud Anchors** for cross-session, cross-device persistence (replaces local `ARAnchorManager` persistence after first scan).
- **LiDAR is enhancement only** — base feature set must work without depth sensor (S25 Ultra has no LiDAR).
- **URP Performant profile** is pre-configured (`AR app/Assets/Settings/URP-Performant.asset`) — stay on this pipeline, do not switch to HDRP.
- **Supabase** handles both auth and realtime WebSocket push to Unity (annotation updates while guest is in-app).
- Annotation data is cached locally in Unity for offline use after first fetch.

---

## Unity Scripting Conventions

- All ARbnb C# scripts go in `AR app/Assets/ARbnb/Scripts/`
- Namespace: `ARbnb`
- Use `ARFoundation` manager singletons via `FindAnyObjectByType<T>()` (Unity 6 API, not deprecated `FindObjectOfType`)
- Prefer `SerializeField` + Inspector wiring over `GetComponent` at runtime for prefab references
- All world-space UI panels use TextMeshPro (already in project via `Assets/TextMesh Pro`)
