const BASE = import.meta.env.VITE_API_BASE_URL || '';
const STORAGE_KEY = 'arbnb_user';

function getToken() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored).id : null;
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function uploadFile(path, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  properties: {
    list:           ()          => request('GET',    '/api/properties'),
    get:            (id)        => request('GET',    `/api/properties/${id}`),
    create:         (body)      => request('POST',   '/api/properties', body),
    update:         (id, body)  => request('PUT',    `/api/properties/${id}`, body),
    delete:         (id)        => request('DELETE', `/api/properties/${id}`),
    uploadFloorPlan:(id, file)  => uploadFile(`/api/properties/${id}/floor-plan`, file),
    uploadModel:    (id, file)  => uploadFile(`/api/properties/${id}/model`, file),
  },

  annotations: {
    list:   (propertyId)        => request('GET',    `/api/properties/${propertyId}/annotations`),
    create: (propertyId, body)  => request('POST',   `/api/properties/${propertyId}/annotations`, body),
    update: (id, body)          => request('PUT',    `/api/annotations/${id}`, body),
    delete: (id)                => request('DELETE', `/api/annotations/${id}`),
  },

  sessions: {
    create:   (propertyId, durationMs) => request('POST',   '/api/sessions', { propertyId, durationMs }),
    checkout: (sessionId)              => request('DELETE', `/api/sessions/${sessionId}`),
  },
};
