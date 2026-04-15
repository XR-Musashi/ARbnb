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

```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | backend + frontend |
| PostgreSQL | 16 | runs as local Windows service |
| Unity | 6 (6000.x) | with Android Build Support module |
| Android SDK | API 26–35 | installed via Unity Hub |
| ADB | any | for USB deployment |
| ARCore Extensions | latest | added inside Unity Package Manager |

---

## 1 — Backend

### First-time setup

```bash
cd backend
npm install
```

Create a `.env` file (copy from example if present, or create manually):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/arbnb"
PORT=3001
```

Run database migrations and seed demo data:

```bash
npm run db:migrate     # create tables
npm run db:seed        # seed demo property + annotations
```

### Start

```bash
npm run dev
```

Runs on **http://localhost:3001**

Health check: `GET http://localhost:3001/health` → `{"status":"ok","db":"ok"}`

### Other useful commands

```bash
npm run db:studio      # open Prisma Studio GUI at http://localhost:5555
npm test               # run Jest tests
```

---

## 2 — Frontend Dashboard

### First-time setup

```bash
cd "frontend dash"
npm install
```

### Start

```bash
npm run dev
```

Runs on **http://localhost:5173**

Open in browser, click **User 1** or **User 2** to log in (no password).
---

## 3 — AR App (Unity)

### First-time setup

1. Open **Unity Hub** → **Add project from disk** → select the `AR app/` folder
2. Open the project in Unity 6
3. Let Unity import all packages
4. Open **`Assets/Scenes/SampleScene.unity`**

### ARCore Extensions setup (one-time)

1. **Window → Package Manager** → **+** → **Add package by name** → enter:
   ```
   com.google.ar.core.arfoundation-extensions
   ```
2. **Edit → Project Settings → XR Plug-in Management → ARCore Extensions**
   - Set **Android Authentication Strategy** → `API Key`
   - Paste your Google Cloud Anchors API key
   - Set **Cloud Anchor Mode** → `Enabled`

### Build & deploy to Android device

1. Connect device via USB
2. **File → Build Settings**
   - Platform: **Android**
   - Minimum API Level: **26**, Target: **35**
   - Scripting Backend: **IL2CPP**, Architecture: **ARM64**
3. Click **Build And Run**

Bundle ID: `com.musashi.arbnb2`

### Connect device to backend

**USB (recommended for development):**

```bash
adb reverse tcp:3001 tcp:3001
```

Run this after every USB reconnect. The app will reach `localhost:3001` through the tunnel.

## Using the App

### Host workflow (dashboard)

1. Log in as User 1 or User 2
2. Create a property
3. Upload a floor plan image (2D tab)
4. In the **3D tab** — if no model exists, click **Generate 3D Model**, enter real-world dimensions (width × depth in metres), click Generate
5. Click on the 3D model to place annotation pins
6. Fill in title, content, and **Height (m)** for each annotation
7. Go to **Sessions** → create a guest token → share with the guest

### Guest workflow (AR app)

1. Launch ARbnb2 on the Android device
2. Enter the guest token and tap **Connect**
3. Walk around — annotation panels appear floating at their real-world positions
4. Use the navigation dropdown to point the arrow toward a destination room

---

## Demo Setup

1. Start backend (`npm run dev` in `backend/`)
2. Connect phone via USB and run `adb reverse tcp:3001 tcp:3001`
3. Create a guest token in the dashboard
4. Mark a reference spot on the floor with tape — all guests start from here
5. First run as **Guest 1** from the reference spot — this hosts the Cloud Anchors
6. Check logcat for `[CloudAnchor] Hosted:` to confirm anchors were saved
7. Subsequent guests get automatic spatial correction via Cloud Anchor resolution

### Resetting Cloud Anchors

If the anchors were hosted from the wrong position, delete them and redo the Guest 1 run:

```bash
cd backend
npm run db:studio      # http://localhost:5555 → CloudAnchor table → delete all rows
```

Or via SQL:

```sql
DELETE FROM "CloudAnchor";
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

**Coordinate systems:** annotations are authored in Three.js (Y-up right-handed). The AR app converts to Unity (Y-up left-handed) by negating Z:

```csharp
var unityPos = new Vector3(worldX, worldY, -worldZ);
```

---

## Tech Stack

| Component | Stack |
|---|---|
| AR App | Unity 6, AR Foundation 6.4.1, ARCore XR Plugin 6.4.1, URP 17.4.0 |
| Spatial persistence | Google Cloud Anchors (ARCore Extensions) |
| Backend | Express 4, Prisma 5, PostgreSQL 16, multer 2 |
| Dashboard | React 18, Vite, Three.js r170, TailwindCSS 3 |
