# ARbnb — AR Indoor Navigation & Spatial Annotation

**Team Musashi · Trinity College Dublin**

Guests use a mobile AR app to navigate unfamiliar rental properties via floating annotation panels anchored to real-world objects. Hosts author annotations through a web dashboard. Annotations persist across sessions using Google Cloud Anchors.

---

## Repository Structure

```
ARbnb2/
├── AR app/           # Unity 6 guest mobile app (Android / ARCore)
├── backend/          # Node.js REST API + PostgreSQL
│   └── uploads/      # floor plans and 3D models (local file storage)
├── frontend dash/    # React + Three.js host dashboard
└── CLAUDE.md         # development reference (stack, conventions, decisions)
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16 running locally (Windows service)
- Unity 6 with Android Build Support, ARCore Extensions
- Android device with ARCore support (tested on Samsung Galaxy S25 Ultra)

### Backend

```bash
cd backend
cp .env.example .env      # edit if needed — defaults work for local dev
npm install
npm run db:migrate
npm run db:seed           # creates demo property + annotations
npm run dev               # http://localhost:3001
```

Health check: `GET http://localhost:3001/health` → `{"status":"ok","db":"ok"}`

Local DB credentials: `postgres / postgres`, database: `arbnb`

### Frontend Dashboard

```bash
cd "frontend dash"
npm install
npm run dev               # http://localhost:5173
```

Login with **User 1** or **User 2** (no password — local auth only).

### AR App (Unity)

1. Open `AR app/` in Unity 6
2. Open `Assets/Scenes/SampleScene.unity`
3. In `Edit > Project Settings > XR Plug-in Management > ARCore Extensions`, paste your Google Cloud Anchors API key and set Cloud Anchor Mode to Enabled
4. Switch platform to Android, minimum API 26 / target API 35, IL2CPP, ARM64
5. **File > Build Settings > Build And Run** to deploy to a connected Android device

---

## Running on Device (USB)

```bash
# Forward backend port through USB so the phone can reach localhost:3001
adb reverse tcp:3001 tcp:3001
```

Run this after each USB reconnect.

---

## Running Wirelessly (Demo / No USB)

Enable Windows Mobile Hotspot on the laptop, connect the phone to it, then update `AR app/Assets/ARbnb/Scripts/ApiClient.cs`:

```csharp
static string BaseUrl => "http://192.168.137.1:3001";
```

Allow the port through Windows Firewall (run once as admin):

```powershell
netsh advfirewall firewall add rule name="ARbnb Backend" dir=in action=allow protocol=TCP localport=3001
```

---

## Architecture

```
Host (browser)
  └─ React dashboard ──► Node.js API ──► PostgreSQL
                                          │
                                          ▼
Guest (Unity AR app) ──► REST API ──► annotations + cloud anchor IDs
                    └──► Google Cloud Anchors API ──► spatial persistence
```

### Annotation authoring

Hosts place pins in either the **2D floor plan editor** (stores `floorX/Y`) or the **3D model viewer** (stores `worldX/Y/Z` in metres). Only 3D-positioned annotations appear in AR.

If no 3D model exists, the dashboard can **auto-generate a flat floor plane** from the uploaded floor plan image — enter real-world dimensions (width × depth in metres) and click Generate. The host can then place 3D pins on the generated plane and set each annotation's height via the **Height (m)** field in the sidebar.

### AR spatial flow

1. **First guest** — panels appear at raw `worldX/Y/Z` positions; Cloud Anchor hosting runs in background and saves `cloudAnchorId` to the backend
2. **Subsequent guests** — panels appear at raw positions first, then snap to the resolved Cloud Anchor transform once ARCore matches the environment (typically 5–30 seconds)
3. **No Cloud Anchor Service wired** — panels use raw positions only

### Coordinate systems

Annotations are authored in Three.js (Y-up right-handed). The AR app converts to Unity (Y-up left-handed):

```csharp
var unityPos = new Vector3(worldX, worldY, -worldZ); // negate Z
```

---

## XR Technical Details

### AR Foundation & ARCore pipeline

The app uses **AR Foundation 6.4.1** as the cross-platform XR abstraction layer, backed by **ARCore XR Plugin 6.4.1** on Android. AR Foundation provides:

- **XROrigin** — the scene root that maps ARCore's world-space tracking into Unity space. All world-space positions are relative to the device's initial position when the AR session starts.
- **ARCameraManager** — manages the ARCore camera feed, feeds frames into AR Foundation's subsystem pipeline for plane detection, feature tracking, and lighting estimation.
- **ARPlaneManager** — detects horizontal/vertical surfaces via ARCore's SLAM (Simultaneous Localisation and Mapping). Not used for annotation placement but contributes to feature map quality for Cloud Anchor hosting.
- **ARAnchorManager** — creates `ARAnchor` components at world positions. Each `ARAnchor` is tracked by ARCore independently; its transform updates as the SLAM map refines. Cloud Anchor IDs are tied to specific `ARAnchor` instances.

ARCore uses **visual-inertial odometry**: camera feature point tracking fused with IMU data to maintain a stable 6-DoF pose estimate without GPS or markers.

### Cloud Anchors — spatial persistence across sessions

**Google Cloud Anchors** (ARCore Extensions `com.google.ar.core.arfoundation-extensions`) solve the problem that ARCore's world space is session-local — each new app launch starts at origin. Without anchors, annotations placed by one user appear at completely wrong positions for the next user.

**Hosting (Guest 1):**
1. ARCore captures a set of visual feature descriptors from the environment around an anchor point.
2. These descriptors are uploaded to Google's servers; the server returns a `cloudAnchorId` string.
3. The `cloudAnchorId` is stored in the backend DB via `POST /api/anchors`.
4. Hosting requires the device to observe the area for a few seconds — quality improves with more distinct visual features (texture, contrast, lighting).

**Resolving (Guest 2+):**
1. The app fetches `cloudAnchorId` from the backend.
2. ARCore downloads the stored feature descriptors and tries to match them against the current camera feed.
3. On match, ARCore returns an `ARAnchor` whose transform is aligned to the original hosting pose in real-world space.
4. `AnnotationPanel.SnapToAnchor(Transform)` re-parents each panel to this anchor transform so it snaps to the correct real-world position.
5. Resolution typically takes 5–30 seconds depending on lighting conditions and how well the environment matches the stored features.

**Fallback:** If no `cloudAnchorId` exists (first ever guest), panels render at raw `worldX/Y/Z` positions relative to the guest's session origin. This is why a **physical reference point** (marked with tape) is important — all guests should start their AR session from the same spot so raw positions are consistent.

**Session origin stability:** ARCore refines its pose estimate continuously. The `ARAnchor` transforms drift slightly during the first ~10 seconds of a session as the SLAM map stabilises. Cloud Anchor resolution implicitly corrects this drift for subsequent guests.

### URP rendering constraints

The app uses **Universal Render Pipeline (URP) 17.4.0** with the Performant quality preset, required by AR Foundation for pass-through camera rendering.

**World Space Canvas limitation:** Unity's `Canvas` in World Space mode does not reliably render in URP AR because it depends on the legacy built-in pipeline's rendering order. In URP, the canvas either renders behind the AR camera background pass or not at all without non-trivial custom renderer feature configuration.

**Solution — 3D primitives only:** `AnnotationPanel.cs` builds cards entirely from `GameObject.CreatePrimitive(PrimitiveType.Quad)` + **TextMeshPro 3D** (`TextMeshPro`, not `TextMeshProUGUI`). TMP 3D renders as a standard mesh, goes through URP's geometry pass, and is always visible in front of the AR background.

**URP material requirement:** `GameObject.CreatePrimitive()` at runtime attaches Unity's legacy `Default-Material` (Standard shader), which renders **solid purple** in URP since URP does not support the Standard shader. The `backgroundMaterial` field on `AnnotationPanel` must be a pre-authored URP asset (shader: `Universal Render Pipeline/Unlit`) assigned in the Inspector. `Shader.Find()` returns null in Android builds because URP shaders are only included in the build if a material asset references them — runtime shader lookup is not reliable.

**TMP 3D text sizing:** TMP 3D's `fontSize` property operates in internal font-point units, not world-space metres. The default LiberationSans SDF font is sampled at 90 pt; at `fontSize = 36`, characters in the 0.003–0.015 localScale range are visible at ~1.5 m AR viewing distance. The reliable approach is to fix `fontSize = 36` and control visible size via `transform.localScale` on the TMP child GameObject — this directly scales the rendered mesh in world space.

**Billboard orientation:** Panels face the camera using:
```csharp
transform.rotation = Quaternion.LookRotation(
    transform.position - _mainCamera.transform.position);
```
This points the panel's **local -Z axis** toward the camera. TMP 3D's readable face is on the **-Z side** of its GameObject (i.e., visible when looking in the +Z direction at it), so this orientation shows text correctly. The background `BackFace` quad is offset to `z = -0.001` (1 mm toward the camera) and rotated 180° around Y to be visible from the same -Z direction.

**TMP word wrap:** `rectTransform.sizeDelta` must be set in TMP local units, not world units. Since the TMP child is scaled down by `localScale`, the rect must be enlarged by `1/scale` to match the card's world-space dimensions:
```csharp
tmp.rectTransform.sizeDelta = new Vector2(
    cardWidth * 0.85f / scale,
    cardHeight        / scale);
```
Without this, the default huge rect means text never wraps before it exits the visible card area.

---

## Floor Plan → 3D Model Pipeline

Annotations placed in the 2D floor plan editor store only normalised `floorX/Y` coordinates (0–1). These cannot map to AR world space without real-world calibration data, so a separate pipeline generates a 3D model the host can place 3D pins on.

### How it works

**`FloorPlanModelGenerator.jsx`** (frontend dashboard component):

1. **Image fetch** — the floor plan image URL (`http://localhost:3001/uploads/…`) is converted to a relative path (`/uploads/…`) so the request goes through the Vite dev server proxy, avoiding CORS. The image is fetched as a `Blob` and converted to an object URL.

2. **Three.js texture** — the blob is loaded as a `THREE.Texture` via `TextureLoader`. `colorSpace` is set to `THREE.SRGBColorSpace`. `flipY` is left at its default (`true`) — Three.js flips image data to match WebGL's bottom-left UV origin, and `GLTFExporter` compensates the UV coordinates automatically so the texture appears correctly in the exported GLB.

3. **Plane geometry** — a `THREE.PlaneGeometry(width, depth)` is created where `width` and `depth` are the real-world dimensions in metres entered by the host. The plane's default orientation is in the XY plane (facing +Z); it is rotated `-Math.PI / 2` around X to lie flat on the XZ plane (Y = 0, floor level). `THREE.MeshBasicMaterial` with `side: THREE.DoubleSide` ensures the plane is visible from both above and below in the Three.js viewer.

4. **GLB export** — `GLTFExporter.parse()` with `{ binary: true }` serialises the scene to a binary GLB `ArrayBuffer`. The GLTF spec stores geometry in metres by default, matching the host's input units directly.

5. **Upload** — the `ArrayBuffer` is wrapped in a `File` object (`model/gltf-binary`) and uploaded to `POST /api/properties/:id/model`, replacing any existing model.

### Host workflow

1. Upload a floor plan image (2D tab → drag & drop).
2. In the 3D tab, if no model exists, the **Generate 3D Model** panel appears.
3. Enter the real-world width (X axis) and depth (Z axis) in metres.
4. Click **Generate** — a textured floor plane is created and uploaded automatically.
5. The 3D viewer loads the generated plane; the host clicks to place annotation pins directly on it.
6. For annotations not at floor level (e.g., a label on a wall outlet), use the **Height (m)** field in the annotation sidebar to adjust `worldY`.

### Coordinate mapping to AR

The generated plane places all pins at `worldY ≈ 0` (floor level) unless the host adjusts the height field. In the Unity AR app:

```csharp
var unityPos = new Vector3(annotation.worldX, annotation.worldY, -annotation.worldZ);
```

The panel appears at the correct real-world height because `worldY` maps directly to Unity's Y axis (both are Y-up). The Z-negation accounts for Three.js being right-handed and Unity being left-handed.

---

## Key Scripts — AR App

| Script | Purpose |
|---|---|
| `ARbnbSession.cs` | Session token management, API bootstrap |
| `AnnotationManager.cs` | Fetches annotations, spawns panels, runs cloud anchor sync |
| `AnnotationPanel.cs` | World-space floating card (3D TMP + Quad, no Canvas/UGUI) |
| `CloudAnchorService.cs` | Wraps ARCore Extensions host/resolve API |
| `WaypointNavigator.cs` | 3D arrow pointing toward chosen destination room |
| `DiscoveryHUD.cs` | Screen-space HUD that reveals room labels on proximity |

All scripts live on a single **ARbnb** GameObject. See `CLAUDE.md` for full Inspector wiring instructions.

---

## Key API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Select user (`user-1` or `user-2`) |
| GET / POST | `/api/properties` | List / create properties |
| POST | `/api/properties/:id/floor-plan` | Upload floor plan image |
| POST | `/api/properties/:id/model` | Upload 3D model (.glb / .gltf) |
| GET / POST | `/api/properties/:id/annotations` | List / create annotations |
| PUT / DELETE | `/api/annotations/:id` | Update (title, content, height) / delete |
| POST / GET | `/api/anchors` | Store / fetch Cloud Anchor IDs |
| POST | `/api/sessions` | Host creates guest token |
| GET | `/api/sessions/me` | Guest validates token |

---

## Demo Checklist

- [ ] Backend running on laptop (`npm run dev` in `backend/`)
- [ ] Phone reachable — USB tunnel (`adb reverse tcp:3001 tcp:3001`) or Mobile Hotspot with updated `BaseUrl`
- [ ] Property set up in dashboard with floor plan + 3D annotations at correct heights
- [ ] AR app built and installed on device
- [ ] Designate a reference spot in the room (mark with tape) — always start the session from here
- [ ] First run as Guest 1 from the reference spot — wait for `[CloudAnchor] Hosted:` in logcat
- [ ] Subsequent guests get automatic spatial correction via Cloud Anchor resolution

---

## Tech Stack

| Component | Stack |
|---|---|
| AR App | Unity 6, AR Foundation 6.4.1, ARCore XR Plugin 6.4.1, URP 17.4.0, XR Interaction Toolkit 3.4.0 |
| Spatial persistence | Google Cloud Anchors (ARCore Extensions for AR Foundation) |
| Backend | Express 4, Prisma 5, PostgreSQL 16 |
| Dashboard | React 18, Vite, Three.js r170, TailwindCSS 3 |
