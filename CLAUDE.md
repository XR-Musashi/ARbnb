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
├── backend/          # Node.js REST API + PostgreSQL
├── frontend dash/    # React + Three.js host dashboard
└── ARbnb_Proposal_Musashi-1.pdf
```

---

## Local Development Setup

**Database:** PostgreSQL runs as a local Windows service (not Docker). No docker-compose needed.

Local Postgres credentials: `postgres / postgres`, database: `arbnb`.

**DBeaver connection:** host `localhost`, port `5432`, database `arbnb`, user `postgres`, password `postgres`.

**Start backend:**
```bash
cd backend
npm run dev       # localhost:3001
```

**Start frontend:**
```bash
cd "frontend dash"
npm run dev       # localhost:5173 (proxies /api → localhost:3001)
```

**ADB reverse tunnel (run after each USB reconnect):**
```bash
adb reverse tcp:3001 tcp:3001
```

**Health check:** `GET http://localhost:3001/health` — returns `{"status":"ok","db":"ok"}` when database is reachable, `{"status":"degraded"}` when not.

---

## Component 1: AR App (Unity)

**Stack:** Unity 6, AR Foundation 6.4.1, ARCore XR Plugin 6.4.1, URP 17.4.0, XR Interaction Toolkit 3.4.0, Input System 1.19.0

**Key Unity packages** (`AR app/Packages/manifest.json`):
- `com.unity.xr.arfoundation`: 6.4.1
- `com.unity.xr.arcore`: 6.4.1
- `com.unity.xr.arkit`: 6.4.1
- `com.unity.xr.interaction.toolkit`: 3.4.0
- `com.unity.render-pipelines.universal`: 17.4.0

**Scenes:** `AR app/Assets/Scenes/SampleScene.unity` — the single main scene.
**ARbnb scripts:** `AR app/Assets/ARbnb/Scripts/` — namespace `ARbnb`.
- `ARbnbSession.cs` — session token management and API bootstrap
- `AnnotationManager.cs` — fetches annotations from API, spawns panels, runs `SyncCloudAnchorsAsync` after spawn; has optional `CloudAnchorService` field (raw world positions used if null)
- `AnnotationPanel.cs` — per-annotation world-space UI panel; `SnapToAnchor(Transform)` parents the panel to a resolved anchor transform
- `CloudAnchorService.cs` — wraps ARCore Extensions Cloud Anchor API; `HostAnchorAsync(Vector3 worldPos)` and `ResolveAnchorAsync(string cloudAnchorId)`; requires `ARAnchorManager` assigned in Inspector

**Template assets:** `AR app/Assets/MobileARTemplateAssets/` — AR plane detection, object placement prefabs, prompt animations from the Unity AR Mobile template.

**Build for Android:**
- Switch platform to Android, minimum API 26, target API 35
- Scripting backend: IL2CPP, ARM64 only
- Bundle ID: `com.musashi.arbnb`
- `File > Build Settings > Build And Run` to deploy to S25 Ultra over USB

**ARCore Extensions** (Google Cloud Anchors) — add via Package Manager by name: `com.google.ar.core.arfoundation-extensions`

**Cloud Anchors Unity Editor setup:**
- All ARbnb scripts live on a single **ARbnb** GameObject (ARbnbSession, AnnotationManager, WaypointNavigator, DiscoveryHUD, CloudAnchorService)
- Add `AR Anchor Manager` component to **XR Origin**
- Add `CloudAnchorService` component to the **ARbnb** GameObject; wire `ARAnchorManager` (on XR Origin) to its Inspector field
- Wire `CloudAnchorService` to the `AnnotationManager` Inspector field (self-reference on ARbnb GameObject)
- Add `ARCoreExtensions` component to the **AR Session** GameObject; wire Session, Session Origin (leave blank — AR Foundation 6 incompatibility), Camera Manager
- Set **Android Authentication Strategy** to `API Key` and paste key in `Edit > Project Settings > XR Plug-in Management > ARCore Extensions`
- Set **Cloud Anchor Mode** to `Enabled` in the same settings page
- Note: `ARCoreExtensions.SessionOrigin` field expects the removed `ARSessionOrigin` type — leave it blank; ARCore Extensions finds `XROrigin` automatically at runtime

**Unity scripting conventions:**
- Use `FindAnyObjectByType<T>()` (Unity 6 API — `FindObjectOfType` is deprecated)
- Prefer `[SerializeField]` + Inspector wiring over runtime `GetComponent`
- All world-space UI uses TextMeshPro (already in project)
- URP Performant profile is pre-configured — do not switch pipeline

**Coordinate system note:** Unity is Y-up left-handed. 3D annotation positions stored in the database are in Three.js Y-up right-handed coordinates. When consuming `worldX/Y/Z` from the API in Unity:
```csharp
var unityPos = new Vector3(worldX, worldY, -worldZ);
```

---

## Component 2: Backend (Node.js)

**Stack:** Express 4, Prisma 5, PostgreSQL 16, Supabase (auth), multer 2

**Entry point:** `backend/src/index.js` — server starts immediately, DB connects in background.

**Commands:**
```bash
cd backend
npm run dev            # nodemon
npm run db:migrate     # Prisma migrate dev
npm run db:seed        # seed demo property + annotations
npm run db:studio      # Prisma Studio GUI
npm test               # Jest (Supabase auth mocked)
```

**Implemented REST endpoints:**
- `GET/POST /api/properties` — list / create (host)
- `GET/PUT/DELETE /api/properties/:id` — manage property
- `POST /api/properties/:id/floor-plan` — upload floor plan image (10 MB limit, Supabase Storage)
- `POST /api/properties/:id/model` — upload 3D model GLB/GLTF (100 MB limit, Supabase Storage)
- `GET/POST /api/properties/:id/annotations` — list / create annotations
- `PUT/DELETE /api/annotations/:id` — update / delete annotation
- `POST/GET /api/anchors` — store / fetch Google Cloud Anchor ID
- `POST /api/sessions` — host creates guest token for a property
- `DELETE /api/sessions/:id` — guest checkout
- `GET /api/sessions/me` — guest validates own token

**Auth middleware** (`src/middleware/auth.js`):
- `requireHost` — verifies Supabase JWT
- `requireGuest` — verifies our own session token
- `requireHostOrGuest` — accepts either

**Database schema** (`prisma/schema.prisma`): `Property`, `Annotation`, `CloudAnchor`, `Session`.
Annotation has both `floorX/floorY` (2D dashboard coords) and `worldX/worldY/worldZ` (3D model coords, metres).

---

## Component 3: Frontend Dashboard (React)

**Stack:** React 18, Vite 8, Three.js r170, TailwindCSS 3, Vitest 3, Supabase JS 2

**Commands:**
```bash
cd "frontend dash"
npm run dev       # localhost:5173
npm run build
npm test
```

**Routes:** `/login`, `/` (dashboard), `/properties/:id/edit`

**Key components:**
- `src/pages/PropertyEdit.jsx` — main editor page with 2D/3D tab toggle
- `src/components/FloorPlanEditor.jsx` — orthographic Three.js canvas; click to place pins (stores `floorX/floorY`, normalised 0–1)
- `src/components/ModelViewer.jsx` — perspective Three.js canvas; orbit mode + place-pin mode; GLTFLoader with DRACOLoader; stores `worldX/worldY/worldZ` in metres
- `src/lib/api.js` — typed fetch wrapper for all backend endpoints
- `src/hooks/useAuth.js` — Supabase auth state

**3D model notes:**
- Draco decoder WASM files are in `frontend dash/public/draco/` (served statically)
- Models should be exported in metres scale (GLTF spec default)
- Blender export: File → Export → glTF 2.0 (.glb), Y-up, metres
- Annotation list: purple dot = 3D position, pink dot = 2D position
- Clicking a pin in the list auto-switches to the correct tab (2D/3D)

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

- Annotations authored in dashboard carry either `floorX/Y` (2D) or `worldX/Y/Z` (3D model coords).
- Cloud anchor flow (two-phase):
  - **First guest:** panels appear immediately at raw `worldX/Y/Z`; `CloudAnchorService.HostAnchorAsync` runs in background; resulting `cloudAnchorId` is saved to DB via `POST /api/anchors`.
  - **Subsequent guests:** panels start at raw positions, then `SnapToAnchor` re-parents each panel to the resolved `ARAnchor` transform once `ResolveAnchorAsync` completes.
- If `CloudAnchorService` is not wired in the Inspector, `AnnotationManager` skips cloud anchor sync and panels remain at raw positions.
- Proximity culling: max 3 annotation panels visible simultaneously (distance-sorted).
- `worldX/Y/Z` from the API must have Z negated before use in Unity (coordinate handedness).

---

## Key Architectural Decisions

- **No marker-based tracking** — markerless ARCore SLAM only.
- **Google Cloud Anchors** for cross-session persistence; local `ARAnchorManager` used as fallback before cloud anchor is established.
- **LiDAR is enhancement only** — S25 Ultra has no LiDAR; base features work without depth sensor.
- **URP Performant profile** pre-configured — do not switch to HDRP.
- **3D model in dashboard** gives hosts precise 3D annotation placement; coordinates map directly to AR world space after Z-negation.
- **Supabase Storage** holds floor plan images (bucket: `floor-plans`) and 3D models (same bucket, under `{hostId}/{propertyId}/model.glb`).
