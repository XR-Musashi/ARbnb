import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * ModelViewer
 * Renders a GLTF/GLB 3D model with pin placement support.
 *
 * Coordinate system: Three.js Y-up right-handed.
 * When consuming worldX/Y/Z in Unity (Y-up left-handed), negate Z:
 *   unityPos = new Vector3(worldX, worldY, -worldZ)
 *
 * Props:
 *   modelUrl      – public URL of the .glb / .gltf file
 *   pins          – [{ id, worldX, worldY, worldZ, title }]
 *   selectedPinId – currently selected pin id (or null)
 *   mode          – 'orbit' | 'place'
 *   onPlacePin    – (worldX, worldY, worldZ) => void
 *   onSelectPin   – (id) => void
 *   onLoadStart   – () => void  (optional)
 *   onLoadEnd     – () => void  (optional)
 */
export default function ModelViewer({
  modelUrl,
  pins,
  selectedPinId,
  mode,
  onPlacePin,
  onSelectPin,
  onLoadStart,
  onLoadEnd,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const pinsRef = useRef(pins);
  const selectedRef = useRef(selectedPinId);
  const modeRef = useRef(mode);
  const pinRadiusRef = useRef(0.08); // updated when model loads

  pinsRef.current = pins;
  selectedRef.current = selectedPinId;
  modeRef.current = mode;

  // ── Init scene once ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf3f4f6);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.01, 1000);
    camera.position.set(5, 5, 5);

    // Scene
    const scene = new THREE.Scene();

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcce0ff, 0.4);
    fill.position.set(-10, 5, -10);
    scene.add(fill);

    // Grid helper for spatial reference
    const grid = new THREE.GridHelper(40, 40, 0xd1d5db, 0xe5e7eb);
    scene.add(grid);

    // Pin group
    const pinGroup = new THREE.Group();
    scene.add(pinGroup);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.5;
    controls.maxDistance = 200;

    const raycaster = new THREE.Raycaster();

    stateRef.current = {
      renderer, camera, scene, pinGroup, controls, raycaster,
      modelMeshes: [],
      animId: null,
    };

    function animate() {
      stateRef.current.animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize
    const ro = new ResizeObserver(() => {
      const W2 = el.clientWidth;
      const H2 = el.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(stateRef.current.animId);
      controls.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load model when URL changes ───────────────────────────────────────────
  useEffect(() => {
    const { scene } = stateRef.current;
    if (!scene || !modelUrl) return;

    onLoadStart?.();

    // Dispose previous model — free GPU memory for geometry and materials
    const prev = scene.getObjectByName('__model__');
    if (prev) {
      scene.remove(prev);
      prev.traverse((node) => {
        if (!node.isMesh) return;
        node.geometry?.dispose();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m) => {
          m?.map?.dispose();
          m?.dispose();
        });
      });
    }
    stateRef.current.modelMeshes = [];

    // DRACOLoader handles Draco-compressed GLBs (Blender's default export).
    // Decoder WASM files are served from /public/draco/ (copied from three/examples/jsm/libs/draco/).
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        model.name = '__model__';

        // Enable shadows on all meshes and collect for raycasting
        const meshes = [];
        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            meshes.push(node);
          }
        });
        stateRef.current.modelMeshes = meshes;

        // Centre model at origin and fit camera
        const box = new THREE.Box3().setFromObject(model);
        const centre = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(centre); // centre at origin

        // Compute a good camera distance
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 1.8;
        const { camera, controls } = stateRef.current;
        camera.position.set(dist, dist * 0.6, dist);
        camera.near = maxDim * 0.001;
        camera.far = maxDim * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        // Scale pin radius proportional to model size
        pinRadiusRef.current = Math.max(0.03, maxDim * 0.015);

        scene.add(model);
        dracoLoader.dispose();
        rebuildPins();
        onLoadEnd?.();
      },
      undefined,
      (err) => {
        console.error('GLTFLoader error:', err);
        dracoLoader.dispose();
        onLoadEnd?.();
      }
    );
  }, [modelUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rebuild pin meshes ────────────────────────────────────────────────────
  const rebuildPins = useCallback(() => {
    const { pinGroup } = stateRef.current;
    if (!pinGroup) return;
    pinGroup.clear();

    for (const pin of pinsRef.current) {
      if (pin.worldX == null) continue;
      const isSelected = pin.id === selectedRef.current;
      const r = pinRadiusRef.current;

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 16),
        new THREE.MeshStandardMaterial({
          color: isSelected ? 0xdb2777 : 0xec4899,
          roughness: 0.3,
          metalness: 0.1,
          emissive: isSelected ? 0x7f1060 : 0x000000,
        })
      );
      sphere.position.set(pin.worldX, pin.worldY, pin.worldZ);
      sphere.userData.pinId = pin.id;
      pinGroup.add(sphere);

      // Vertical stem line from pin down to floor
      const stemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pin.worldX, pin.worldY, pin.worldZ),
        new THREE.Vector3(pin.worldX, pin.worldY - r * 4, pin.worldZ),
      ]);
      pinGroup.add(new THREE.Line(stemGeo, new THREE.LineBasicMaterial({ color: 0xbe185d })));

      if (isSelected) {
        // Selection ring
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r * 1.6, r * 0.2, 8, 32),
          new THREE.MeshBasicMaterial({ color: 0xfdf2f8, side: THREE.DoubleSide })
        );
        ring.position.set(pin.worldX, pin.worldY, pin.worldZ);
        ring.lookAt(stateRef.current.camera.position);
        pinGroup.add(ring);
      }
    }
  }, []);

  useEffect(() => { rebuildPins(); }, [pins, selectedPinId, rebuildPins]);

  // ── Sync OrbitControls enabled state with mode ────────────────────────────
  useEffect(() => {
    const { controls } = stateRef.current;
    if (!controls) return;
    controls.enabled = mode === 'orbit';
    if (mountRef.current) {
      mountRef.current.style.cursor = mode === 'place' ? 'crosshair' : 'grab';
    }
  }, [mode]);

  // ── Pointer interaction ───────────────────────────────────────────────────
  function getNormPointer(e) {
    const rect = mountRef.current.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function onPointerDown(e) {
    const { raycaster, camera, pinGroup, modelMeshes } = stateRef.current;
    const ptr = getNormPointer(e);
    raycaster.setFromCamera(ptr, camera);

    // Always check pins first (in both modes)
    const pinMeshes = pinGroup.children.filter((c) => c.userData.pinId);
    const pinHits = raycaster.intersectObjects(pinMeshes);
    if (pinHits.length) {
      onSelectPin?.(pinHits[0].object.userData.pinId);
      return;
    }

    // Place pin only in 'place' mode
    if (modeRef.current !== 'place') return;
    if (!modelMeshes.length) return;

    const hits = raycaster.intersectObjects(modelMeshes, false);
    if (hits.length) {
      const { x, y, z } = hits[0].point;
      // Round to 4 decimal places (sub-millimetre precision in metres)
      onPlacePin?.(
        Math.round(x * 10000) / 10000,
        Math.round(y * 10000) / 10000,
        Math.round(z * 10000) / 10000
      );
    }
  }

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onPointerDown={onPointerDown}
    />
  );
}
