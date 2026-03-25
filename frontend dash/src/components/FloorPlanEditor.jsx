import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

/**
 * FloorPlanEditor
 * Renders the floor plan image on a Three.js orthographic scene.
 * Click anywhere on the image to place a pin.
 * Click an existing pin to select it.
 * Drag a selected pin to move it.
 *
 * Props:
 *   floorPlanUrl  – image URL to display as background
 *   pins          – [{ id, floorX, floorY, title }]
 *   selectedPinId – currently selected pin id (or null)
 *   onPlacePin    – (floorX, floorY) => void  – called on empty-space click
 *   onSelectPin   – (id) => void
 *   onMovePin     – (id, floorX, floorY) => void
 */
export default function FloorPlanEditor({
  floorPlanUrl,
  pins,
  selectedPinId,
  onPlacePin,
  onSelectPin,
  onMovePin,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef({});    // holds Three.js objects so we don't re-init on prop changes
  const pinsRef = useRef(pins);
  const selectedRef = useRef(selectedPinId);
  const dragging = useRef(null);  // { id, mesh }

  pinsRef.current = pins;
  selectedRef.current = selectedPinId;

  // ── Init scene once ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    const W = el.clientWidth;
    const H = el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.setClearColor(0xf3f4f6);
    el.appendChild(renderer.domElement);

    const aspect = W / H;
    const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    camera.position.z = 5;

    const scene = new THREE.Scene();
    const pinGroup = new THREE.Group();
    scene.add(pinGroup);

    // Floor plan image plane (updated when floorPlanUrl changes)
    const planeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * aspect, 2),
      new THREE.MeshBasicMaterial({ color: 0xcccccc })
    );
    scene.add(planeMesh);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    stateRef.current = { renderer, camera, scene, pinGroup, planeMesh, raycaster, pointer, aspect };

    function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    function onResize() {
      const W2 = el.clientWidth;
      const H2 = el.clientHeight;
      const a = W2 / H2;
      camera.left = -a; camera.right = a;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
      planeMesh.geometry.dispose();
      planeMesh.geometry = new THREE.PlaneGeometry(2 * a, 2);
      stateRef.current.aspect = a;
      rebuildPins();
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      ro.disconnect();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load floor plan texture when URL changes ──────────────────────────────
  useEffect(() => {
    const { planeMesh } = stateRef.current;
    if (!planeMesh) return;
    if (!floorPlanUrl) {
      planeMesh.material.map = null;
      planeMesh.material.color.set(0xcccccc);
      planeMesh.material.needsUpdate = true;
      return;
    }
    new THREE.TextureLoader().load(floorPlanUrl, (tex) => {
      planeMesh.material.map = tex;
      planeMesh.material.color.set(0xffffff);
      planeMesh.material.needsUpdate = true;
    });
  }, [floorPlanUrl]);

  // ── Convert normalised floor coords (0-1) to scene coords ────────────────
  function floorToScene(floorX, floorY) {
    const { aspect } = stateRef.current;
    return new THREE.Vector3(
      (floorX - 0.5) * 2 * aspect,
      (0.5 - floorY) * 2,
      0.01
    );
  }

  function sceneToFloor(x, y) {
    const { aspect } = stateRef.current;
    return {
      floorX: x / (2 * aspect) + 0.5,
      floorY: 0.5 - y / 2,
    };
  }

  // ── Rebuild pin meshes whenever pins or selection changes ─────────────────
  const rebuildPins = useCallback(() => {
    const { pinGroup } = stateRef.current;
    if (!pinGroup) return;
    pinGroup.clear();

    for (const pin of pinsRef.current) {
      const isSelected = pin.id === selectedRef.current;
      const geo = new THREE.CircleGeometry(0.035, 24);
      const mat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xdb2777 : 0xec4899,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(floorToScene(pin.floorX ?? 0.5, pin.floorY ?? 0.5));
      mesh.userData.pinId = pin.id;

      // Outline ring for selected
      if (isSelected) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.038, 0.05, 24),
          new THREE.MeshBasicMaterial({ color: 0xbe185d, side: THREE.DoubleSide })
        );
        ring.position.copy(mesh.position);
        pinGroup.add(ring);
      }
      pinGroup.add(mesh);
    }
  }, []);

  useEffect(() => { rebuildPins(); }, [pins, selectedPinId, rebuildPins]);

  // ── Pointer interaction ───────────────────────────────────────────────────
  function getNormalisedPointer(e) {
    const rect = mountRef.current.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function onPointerDown(e) {
    const { raycaster, camera, pinGroup, planeMesh } = stateRef.current;
    const ptr = getNormalisedPointer(e);
    raycaster.setFromCamera(ptr, camera);

    // Check pins first
    const pinMeshes = pinGroup.children.filter((c) => c.userData.pinId);
    const pinHits = raycaster.intersectObjects(pinMeshes);
    if (pinHits.length) {
      const hit = pinHits[0].object;
      onSelectPin(hit.userData.pinId);
      dragging.current = { id: hit.userData.pinId };
      e.currentTarget.style.cursor = 'grabbing';
      return;
    }

    // Click on floor plane → place new pin
    const planeHits = raycaster.intersectObject(planeMesh);
    if (planeHits.length) {
      const { x, y } = planeHits[0].point;
      const { floorX, floorY } = sceneToFloor(x, y);
      onPlacePin(
        Math.max(0, Math.min(1, floorX)),
        Math.max(0, Math.min(1, floorY))
      );
    }
  }

  function onPointerMove(e) {
    if (!dragging.current) return;
    const { raycaster, camera, planeMesh } = stateRef.current;
    const ptr = getNormalisedPointer(e);
    raycaster.setFromCamera(ptr, camera);
    const hits = raycaster.intersectObject(planeMesh);
    if (!hits.length) return;
    const { x, y } = hits[0].point;
    const { floorX, floorY } = sceneToFloor(x, y);
    onMovePin(
      dragging.current.id,
      Math.max(0, Math.min(1, floorX)),
      Math.max(0, Math.min(1, floorY))
    );
  }

  function onPointerUp(e) {
    dragging.current = null;
    e.currentTarget.style.cursor = 'crosshair';
  }

  return (
    <div
      ref={mountRef}
      className="floorplan-canvas rounded-xl overflow-hidden"
      style={{ height: '100%' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );
}
