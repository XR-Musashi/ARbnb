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
│   └── uploads/      # local file storage for floor plans and 3D models
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
- `AnnotationPanel.cs` — per-annotation world-space floating card; built procedurally from a Quad + two 3D TextMeshPro components (no Canvas/UGUI — World Space Canvas does not render reliably in Unity 6 URP AR); `SnapToAnchor(Transform)` parents the panel to a resolved anchor transform; requires a URP-compatible `backgroundMaterial` assigned in Inspector
- `CloudAnchorService.cs` — wraps ARCore Extensions Cloud Anchor API; `HostAnchorAsync(Vector3 worldPos)` and `ResolveAnchorAsync(string cloudAnchorId)`; requires `ARAnchorManager` assigned in Inspector

**Template assets:** `AR app/Assets/MobileARTemplateAssets/` — AR plane detection, object placement prefabs, prompt animations from the Unity AR Mobile template.

**Build for Android:**
- Switch platform to Android, minimum API 26, target API 35
- Scripting backend: IL2CPP, ARM64 only
- Bundle ID: `com.musashi.arbnb2`
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

**AnnotationPanel prefab setup:**
- The prefab root only needs the `AnnotationPanel` script — no Canvas, no CanvasGroup
- Create a Material asset: shader = **Universal Render Pipeline/Unlit**, dark colour, opaque
- Assign it to the `Background Material` field on the AnnotationPanel script in the Inspector
- The card (Quad + 3D TMP labels) is built entirely in code at runtime — do not add Canvas children

**World-space UI note:** `GameObject.CreatePrimitive()` at runtime in a URP project gets Unity's legacy `Default-Material` (Standard shader), which renders **purple** in URP. Always assign a pre-authored URP material via `[SerializeField]`; never rely on `Shader.Find` in a build (shader won't be included unless referenced by a material asset).

**AnnotationPanel card geometry (from `BuildCard()`):**
- `Background` quad at `localPosition = (0,0,0)` — back face, not seen by camera
- `BackFace` quad at `localPosition = (0,0,-0.001)`, `localRotation = Euler(0,180,0)` — faces camera (which looks in +Z local direction); 1 mm offset prevents z-fighting
- TMP children at `localPosition.z = -0.003` — in front of both quads toward camera
- Billboard: `LookRotation(panelPos - camPos)` points panel's **-Z axis** toward camera; TMP 3D's readable face is on the -Z side of the child GameObject, so text reads correctly
- TMP word wrap: `rectTransform.sizeDelta = new Vector2(cardWidth * 0.85f / scale, cardHeight / scale)` — converts world-space card dimensions into TMP local units (world / localScale); without this the default large rect means text never wraps at the card boundary

**TMP 3D text sizing:**
- `fontSize` is in internal font-point units, NOT world metres. At the default LiberationSans SDF font sampled at 90 pt, `fontSize` values 0.03–15 all produce characters of nearly identical, submillimetre size.
- Control visible world-space size via `go.transform.localScale = Vector3.one * scale` where `scale` is a `[SerializeField]` (typically 0.004–0.008 for text readable at ~1.5 m AR distance).
- Fix `fontSize = 36` (standard TMP reference size) and only adjust `scale` in the Inspector.

**Unity scripting conventions:**
- Use `FindAnyObjectByType<T>()` (Unity 6 API — `FindObjectOfType` is deprecated)
- Prefer `[SerializeField]` + Inspector wiring over runtime `GetComponent`
- All world-space labels use TextMeshPro 3D (`TextMeshPro`, not `TextMeshProUGUI`)
- URP Performant profile is pre-configured — do not switch pipeline

**Coordinate system note:** Unity is Y-up left-handed. 3D annotation positions stored in the database are in Three.js Y-up right-handed coordinates. When consuming `worldX/Y/Z` from the API in Unity:
```csharp
var unityPos = new Vector3(worldX, worldY, -worldZ);
```

---

## Component 2: Backend (Node.js)

**Stack:** Express 4, Prisma 5, PostgreSQL 16, multer 2. No cloud services — fully local.

**Entry point:** `backend/src/index.js` — server starts immediately, DB connects in background.

**Commands:**
```bash
cd backend
npm run dev            # nodemon
npm run db:migrate     # Prisma migrate dev
npm run db:seed        # seed demo property + annotations
npm run db:studio      # Prisma Studio GUI
npm test               # Jest
```

**Implemented REST endpoints:**
- `POST /api/auth/login` — select user (body: `{ userId: "user-1" | "user-2" }`); returns `{ userId, name }`
- `GET/POST /api/properties` — list / create (host)
- `GET/PUT/DELETE /api/properties/:id` — manage property
- `POST /api/properties/:id/floor-plan` — upload floor plan image (100 MB limit, saved to `backend/uploads/`)
- `POST /api/properties/:id/model` — upload 3D model GLB/GLTF (100 MB limit, saved to `backend/uploads/`)
- `GET /uploads/*` — static file serving for uploaded floor plans and models
- `GET/POST /api/properties/:id/annotations` — list / create annotations
- `PUT/DELETE /api/annotations/:id` — update / delete annotation
- `POST/GET /api/anchors` — store / fetch Google Cloud Anchor ID
- `POST /api/sessions` — host creates guest token for a property
- `DELETE /api/sessions/:id` — guest checkout
- `GET /api/sessions/me` — guest validates own token

**Auth middleware** (`src/middleware/auth.js`):
- `requireHost` — checks `Authorization: Bearer user-1` or `Bearer user-2`; no passwords, no Supabase
- `requireGuest` — verifies short-lived guest session token against local DB
- `requireHostOrGuest` — accepts either

**Local users:** `user-1` and `user-2` are hardcoded in `src/middleware/auth.js` and `src/app.js`. The `hostId` column on `Property` stores `"user-1"` or `"user-2"`.

**File storage:** uploaded files go to `backend/uploads/{userId}/{propertyId}/{subfolder}/filename`. Served statically at `GET /uploads/*`. The stored URL in the DB is an absolute `http://localhost:3001/uploads/...` URL.

**Database schema** (`prisma/schema.prisma`): `Property`, `Annotation`, `CloudAnchor`, `Session`.
Annotation has both `floorX/floorY` (2D dashboard coords) and `worldX/worldY/worldZ` (3D model coords, metres).

---

## Component 3: Frontend Dashboard (React)

**Stack:** React 18, Vite 8, Three.js r170, TailwindCSS 3, Vitest 3

**Commands:**
```bash
cd "frontend dash"
npm run dev       # localhost:5173
npm run build
npm test
```

**Routes:** `/login`, `/` (dashboard), `/properties/:id/edit`

**Auth:** `src/hooks/useAuth.js` stores `{ id, name }` in `localStorage` under key `arbnb_user`. The userId (`user-1` / `user-2`) is sent as `Authorization: Bearer <userId>` on every API request. No Supabase.

**Login page:** two buttons — "User 1" and "User 2". No password.

**Key components:**
- `src/pages/PropertyEdit.jsx` — main editor page with 2D/3D tab toggle; annotation sidebar includes a **Height (m)** field that writes to `worldY` (only shown for 3D-positioned annotations)
- `src/components/FloorPlanEditor.jsx` — orthographic Three.js canvas; click to place pins (stores `floorX/floorY`, normalised 0–1)
- `src/components/ModelViewer.jsx` — perspective Three.js canvas; orbit mode + place-pin mode; GLTFLoader with DRACOLoader; stores `worldX/worldY/worldZ` in metres
- `src/components/FloorPlanModelGenerator.jsx` — generates a flat horizontal GLB from the floor plan image and uploads it as the property's 3D model (see below)
- `src/lib/api.js` — fetch wrapper; reads auth token from localStorage; no Supabase
- `src/hooks/useAuth.js` — localStorage-based auth state

**FloorPlanModelGenerator pipeline:**
1. Floor plan image URL is converted from absolute (`http://localhost:3001/uploads/…`) to relative (`/uploads/…`) and fetched through the Vite proxy to avoid CORS
2. Loaded as a `THREE.Texture` with `colorSpace = THREE.SRGBColorSpace`; `flipY` left at default `true` — Three.js flips image data for WebGL's bottom-left UV origin and `GLTFExporter` compensates UV coordinates automatically
3. `THREE.PlaneGeometry(width, depth)` rotated `-Math.PI/2` around X to lie flat on the XZ plane (Y = 0, floor level); `THREE.MeshBasicMaterial({ side: THREE.DoubleSide })`
4. `GLTFExporter.parse(scene, …, { binary: true })` serialises to a binary GLB `ArrayBuffer` (coordinates in metres per GLTF spec)
5. Uploaded to `POST /api/properties/:id/model` as `model/gltf-binary`
- **Vite proxy:** `vite.config.js` proxies both `/api` and `/uploads` to `http://localhost:3001` so floor plan images can be fetched without CORS during GLB generation

**3D model notes:**
- Draco decoder WASM files are in `frontend dash/public/draco/` (served statically)
- Models should be exported in metres scale (GLTF spec default)
- Blender export: File → Export → glTF 2.0 (.glb), Y-up, metres
- Annotation list: purple dot = 3D position, pink dot = 2D position
- Clicking a pin in the list auto-switches to the correct tab (2D/3D)
- 2D-only annotations (`floorX/Y` set, no `worldX/Y/Z`) do **not** appear in AR; host must generate/upload a 3D model and re-place pins to get AR visibility

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

- **No cloud services** — auth and file storage are fully local; Supabase has been removed entirely.
- **No marker-based tracking** — markerless ARCore SLAM only.
- **Google Cloud Anchors** for cross-session persistence; local `ARAnchorManager` used as fallback before cloud anchor is established.
- **LiDAR is enhancement only** — S25 Ultra has no LiDAR; base features work without depth sensor.
- **URP Performant profile** pre-configured — do not switch to HDRP.
- **3D model in dashboard** gives hosts precise 3D annotation placement; coordinates map directly to AR world space after Z-negation.
- **Local file storage** — floor plans and models stored in `backend/uploads/`, served via Express static middleware.
