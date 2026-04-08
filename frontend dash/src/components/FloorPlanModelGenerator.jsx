import { useState } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { api } from '../lib/api';

/**
 * Generates a flat horizontal GLB model from the property's floor plan image.
 * The host enters real-world dimensions; the component creates a PlaneGeometry
 * textured with the floor plan and uploads it as the property's 3D model.
 *
 * Coordinate layout of the generated plane (Three.js Y-up right-handed):
 *   - Width  → X axis
 *   - Depth  → Z axis
 *   - Y = 0  (floor level)
 * Annotation pins placed on this plane will have worldY ≈ 0 and map directly
 * to AR world space after the standard Z-negation.
 */
export default function FloorPlanModelGenerator({ propertyId, floorPlanUrl, onModelReady }) {
  const [width, setWidth] = useState(10);
  const [depth, setDepth] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      // Convert absolute URL (http://localhost:3001/uploads/…) to a relative path
      // so the request goes through the Vite proxy and avoids CORS.
      let imgPath = floorPlanUrl;
      try { imgPath = new URL(floorPlanUrl).pathname; } catch {}

      // Fetch the floor plan image as a blob
      const resp = await fetch(imgPath);
      if (!resp.ok) throw new Error(`Could not load floor plan image (${resp.status})`);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);

      // Load as a Three.js texture
      const texture = await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(objectUrl, resolve, undefined, reject);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      // Keep flipY = true (default) — Three.js flips images to match WebGL convention,
      // and GLTFExporter compensates the UVs automatically.

      // Build a horizontal plane lying on the XZ plane (Y = 0)
      const geometry = new THREE.PlaneGeometry(width, depth);
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;

      const scene = new THREE.Scene();
      scene.add(mesh);

      // Export as binary GLB
      const glb = await new Promise((resolve, reject) => {
        new GLTFExporter().parse(
          scene,
          (result) => resolve(result),
          (err) => reject(new Error(String(err))),
          { binary: true }
        );
      });

      URL.revokeObjectURL(objectUrl);

      // Upload to the existing model endpoint
      const file = new File([glb], 'floor-plan-model.glb', { type: 'model/gltf-binary' });
      const { modelUrl } = await api.properties.uploadModel(propertyId, file);
      onModelReady(modelUrl);
    } catch (e) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
      <div>
        <h3 className="font-semibold text-gray-700 mb-1">Generate 3D model from floor plan</h3>
        <p className="text-sm text-gray-400 max-w-xs">
          Enter the real-world dimensions of the space. This creates a flat floor
          plane you can place annotation pins on.
        </p>
      </div>

      <div className="flex gap-4">
        <label className="flex flex-col gap-1 items-center">
          <span className="text-xs font-medium text-gray-600">Width (m)</span>
          <input
            type="number" min="1" max="200" step="0.5"
            value={width}
            onChange={(e) => setWidth(parseFloat(e.target.value) || 10)}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center
                       focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 items-center">
          <span className="text-xs font-medium text-gray-600">Depth (m)</span>
          <input
            type="number" min="1" max="200" step="0.5"
            value={depth}
            onChange={(e) => setDepth(parseFloat(e.target.value) || 8)}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center
                       focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={generate}
        disabled={generating}
        className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium
                   px-6 py-2.5 rounded-lg disabled:opacity-50 transition"
      >
        {generating ? 'Generating…' : 'Generate 3D Model'}
      </button>

      <p className="text-xs text-gray-300 max-w-xs">
        Width = left/right on the floor plan · Depth = top/bottom.
        You can replace this later with a real .glb model.
      </p>
    </div>
  );
}
