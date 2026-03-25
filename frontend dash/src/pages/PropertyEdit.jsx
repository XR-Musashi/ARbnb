import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import FloorPlanEditor from '../components/FloorPlanEditor';
import ModelViewer from '../components/ModelViewer';

export default function PropertyEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [property, setProperty] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editor state
  const [editorTab, setEditorTab] = useState('2d');   // '2d' | '3d'
  const [viewerMode, setViewerMode] = useState('orbit'); // 'orbit' | 'place'
  const [uploading, setUploading] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);

  // Annotation form
  const [form, setForm] = useState({ title: '', content: '', roomLabel: '' });
  const [saving, setSaving] = useState(false);

  const selectedAnnotation = annotations.find((a) => a.id === selectedId) ?? null;

  // Pins for 2D editor (have floorX/Y), pins for 3D viewer (have worldX/Y/Z)
  const pins2d = annotations.filter((a) => a.floorX != null);
  const pins3d = annotations.filter((a) => a.worldX != null);

  useEffect(() => {
    Promise.all([api.properties.get(id), api.annotations.list(id)])
      .then(([prop, anns]) => {
        setProperty(prop);
        setAnnotations(anns);
        // Auto-switch to 3D tab if a model is already uploaded
        if (prop.modelUrl) setEditorTab('3d');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (selectedAnnotation) {
      setForm({
        title: selectedAnnotation.title,
        content: selectedAnnotation.content,
        roomLabel: selectedAnnotation.roomLabel ?? '',
      });
    } else {
      setForm({ title: '', content: '', roomLabel: '' });
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Uploads ───────────────────────────────────────────────────────────────
  async function handleFloorPlanUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { floorPlanUrl } = await api.properties.uploadFloorPlan(id, file);
      setProperty((p) => ({ ...p, floorPlanUrl }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleModelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { modelUrl } = await api.properties.uploadModel(id, file);
      setProperty((p) => ({ ...p, modelUrl }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  // ── Pin placement ─────────────────────────────────────────────────────────
  const handlePlacePin2D = useCallback(async (floorX, floorY) => {
    try {
      const ann = await api.annotations.create(id, { title: 'Untitled', floorX, floorY });
      setAnnotations((prev) => [...prev, ann]);
      setSelectedId(ann.id);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  const handlePlacePin3D = useCallback(async (worldX, worldY, worldZ) => {
    try {
      const ann = await api.annotations.create(id, { title: 'Untitled', worldX, worldY, worldZ });
      setAnnotations((prev) => [...prev, ann]);
      setSelectedId(ann.id);
      setViewerMode('orbit'); // switch back to orbit after placing
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  const handleMovePin2D = useCallback((pinId, floorX, floorY) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === pinId ? { ...a, floorX, floorY } : a))
    );
  }, []);

  // ── Annotation form ───────────────────────────────────────────────────────
  async function saveAnnotation(e) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.annotations.update(selectedId, {
        title: form.title,
        content: form.content,
        roomLabel: form.roomLabel || null,
      });
      setAnnotations((prev) => prev.map((a) => (a.id === selectedId ? { ...a, ...updated } : a)));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnotation() {
    if (!selectedId || !confirm('Delete this annotation?')) return;
    await api.annotations.delete(selectedId);
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Nav */}
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Dashboard
        </button>
        <h1 className="font-semibold text-gray-800">{property?.name}</h1>
        {property?.address && <span className="text-sm text-gray-500">{property.address}</span>}
      </header>

      {error && <p className="text-sm text-red-600 px-6 py-2 bg-red-50 border-b border-red-100">{error}</p>}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: editor panel ── */}
        <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">

          {/* Tab bar + toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* 2D / 3D tabs */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
              <button
                onClick={() => setEditorTab('2d')}
                className={`px-4 py-1.5 transition ${editorTab === '2d' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                2D Floor Plan
              </button>
              <button
                onClick={() => setEditorTab('3d')}
                className={`px-4 py-1.5 transition ${editorTab === '3d' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                3D Model
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Upload button */}
              {editorTab === '2d' ? (
                <label className="cursor-pointer bg-white border border-gray-300 text-sm text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
                  {uploading ? 'Uploading…' : property?.floorPlanUrl ? 'Replace floor plan' : 'Upload floor plan'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleFloorPlanUpload} disabled={uploading} />
                </label>
              ) : (
                <label className="cursor-pointer bg-white border border-gray-300 text-sm text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
                  {uploading ? 'Uploading…' : property?.modelUrl ? 'Replace 3D model' : 'Upload 3D model (.glb / .gltf)'}
                  <input type="file" accept=".glb,.gltf" className="hidden" onChange={handleModelUpload} disabled={uploading} />
                </label>
              )}

              {/* Orbit / Place toggle (3D only) */}
              {editorTab === '3d' && property?.modelUrl && (
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
                  <button
                    onClick={() => setViewerMode('orbit')}
                    className={`px-3 py-1.5 transition ${viewerMode === 'orbit' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    title="Rotate / zoom the model"
                  >
                    Orbit
                  </button>
                  <button
                    onClick={() => setViewerMode('place')}
                    className={`px-3 py-1.5 transition ${viewerMode === 'place' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    title="Click on model surface to place a pin"
                  >
                    Place Pin
                  </button>
                </div>
              )}

              {editorTab === '2d' && (
                <span className="text-xs text-gray-400 hidden sm:block">
                  Click on floor plan to place a pin
                </span>
              )}
              {editorTab === '3d' && viewerMode === 'place' && (
                <span className="text-xs text-brand-600 hidden sm:block font-medium">
                  Click on model surface to place a pin
                </span>
              )}
            </div>
          </div>

          {/* Editor canvas */}
          <div className="flex-1 bg-white border rounded-xl overflow-hidden" style={{ minHeight: 420 }}>
            {editorTab === '2d' ? (
              <FloorPlanEditor
                floorPlanUrl={property?.floorPlanUrl}
                pins={pins2d}
                selectedPinId={selectedId}
                onPlacePin={handlePlacePin2D}
                onSelectPin={setSelectedId}
                onMovePin={handleMovePin2D}
              />
            ) : property?.modelUrl ? (
              <ModelViewer
                modelUrl={property.modelUrl}
                pins={pins3d}
                selectedPinId={selectedId}
                mode={viewerMode}
                onPlacePin={handlePlacePin3D}
                onSelectPin={setSelectedId}
                onLoadStart={() => setModelLoading(true)}
                onLoadEnd={() => setModelLoading(false)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <svg className="w-12 h-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
                <p className="text-sm">Upload a .glb or .gltf model to get started</p>
                <p className="text-xs text-gray-300">Model should be in metres scale for accurate AR placement</p>
              </div>
            )}

            {/* Model loading overlay */}
            {editorTab === '3d' && modelLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
                <p className="text-sm text-gray-500">Loading model…</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: annotation sidebar ── */}
        <div className="w-80 bg-white border-l flex flex-col shrink-0">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold text-gray-800 text-sm">
              {selectedAnnotation ? 'Edit Annotation' : `Annotations (${annotations.length})`}
            </h2>
          </div>

          {selectedAnnotation ? (
            <form onSubmit={saveAnnotation} className="flex flex-col gap-4 p-5 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                <textarea
                  rows={5}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Instructions, rules, tips…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Room label</label>
                <input
                  value={form.roomLabel}
                  onChange={(e) => setForm((f) => ({ ...f, roomLabel: e.target.value }))}
                  placeholder="e.g. kitchen, entrance"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Show 3D world position if set */}
              {selectedAnnotation.worldX != null && (
                <div className="text-xs text-gray-400 font-mono bg-gray-50 rounded p-2">
                  3D: ({selectedAnnotation.worldX.toFixed(3)}, {selectedAnnotation.worldY.toFixed(3)}, {selectedAnnotation.worldZ.toFixed(3)}) m
                </div>
              )}

              <div className="flex gap-2 mt-auto">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50 transition"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={deleteAnnotation}
                  className="text-sm text-red-500 hover:text-red-700 px-3"
                >
                  Delete
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-xs text-gray-400 hover:text-gray-600 text-center"
              >
                ← Back to list
              </button>
            </form>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y">
              {annotations.length === 0 ? (
                <li className="p-5 text-sm text-gray-400">
                  No annotations yet. Place a pin on the floor plan or 3D model.
                </li>
              ) : (
                annotations.map((a) => (
                  <li
                    key={a.id}
                    onClick={() => {
                      setSelectedId(a.id);
                      // Auto-switch to the right tab
                      if (a.worldX != null) setEditorTab('3d');
                      else if (a.floorX != null) setEditorTab('2d');
                    }}
                    className="px-5 py-3 cursor-pointer hover:bg-gray-50 transition flex items-center gap-2"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${a.worldX != null ? 'bg-purple-400' : 'bg-pink-400'}`}
                      title={a.worldX != null ? '3D position' : '2D position'}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.title}</p>
                      {a.roomLabel && <p className="text-xs text-gray-400">{a.roomLabel}</p>}
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
