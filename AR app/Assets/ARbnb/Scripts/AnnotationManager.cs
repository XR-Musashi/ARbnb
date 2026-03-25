using System;
using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.XR.ARFoundation;

namespace ARbnb
{
    /// <summary>
    /// Fetches annotations from the API and manages their world-space panels.
    ///
    /// Proximity culling: keeps the 3 closest panels visible at all times.
    /// Panels with no 3D position (dashboard 2D-only pins) are skipped.
    ///
    /// Scene wiring:
    ///   - annotationPanelPrefab  → the AnnotationPanel prefab
    ///   - cullingRoot            → XR Origin's Camera Offset or Camera transform
    ///   - statusLabel            → optional TMP_Text for loading feedback
    /// </summary>
    public class AnnotationManager : MonoBehaviour
    {
        [Header("Prefabs & References")]
        [SerializeField] AnnotationPanel annotationPanelPrefab;
        [SerializeField] Transform cullingRoot;     // camera transform used for distance checks
        [SerializeField] TMP_Text statusLabel;

        [Header("Dependents")]
        [SerializeField] WaypointNavigator waypointNavigator;
        [SerializeField] DiscoveryHUD discoveryHUD;

        [Header("Culling")]
        [SerializeField] int maxVisible = 3;
        [SerializeField] float cullingInterval = 0.5f; // seconds between culling passes

        List<AnnotationPanel> _panels = new();
        float _cullingTimer;

        // ── Public entry point called by ARbnbSession ────────────────────────

        public async void LoadAnnotations(string propertyId)
        {
            SetStatus("Loading annotations…");
            try
            {
                var annotations = await ApiClient.GetAnnotationsAsync(propertyId);
                SpawnPanels(annotations);
                SetStatus($"{_panels.Count} annotation(s) loaded.");
            }
            catch (Exception e)
            {
                Debug.LogError($"[ARbnb] Failed to load annotations: {e.Message}");
                SetStatus("Failed to load annotations.");
            }
        }

        // ── Panel spawning ───────────────────────────────────────────────────

        void SpawnPanels(List<AnnotationData> annotations)
        {
            // Clear existing panels
            foreach (var p in _panels) Destroy(p.gameObject);
            _panels.Clear();

            foreach (var ann in annotations)
            {
                if (!ann.HasWorldPosition)
                {
                    Debug.Log($"[ARbnb] Skipping annotation '{ann.Title}' — no 3D position.");
                    continue;
                }

                var panel = Instantiate(annotationPanelPrefab, ann.ToUnityPosition(), Quaternion.identity);
                panel.Initialise(ann);
                _panels.Add(panel);
            }

            // Initial cull
            RunProximityCull();

            // Notify dependents
            var allAnnotations = GetAllAnnotations();
            waypointNavigator?.PopulateDestinations(allAnnotations);
            discoveryHUD?.Initialise(allAnnotations);
        }

        // ── Proximity culling ────────────────────────────────────────────────

        void Update()
        {
            if (_panels.Count == 0) return;
            _cullingTimer -= Time.deltaTime;
            if (_cullingTimer <= 0f)
            {
                _cullingTimer = cullingInterval;
                RunProximityCull();
            }
        }

        void RunProximityCull()
        {
            if (_panels.Count == 0) return;

            var origin = cullingRoot != null ? cullingRoot.position : Camera.main.transform.position;

            // Sort by distance ascending
            var sorted = _panels
                .OrderBy(p => p.DistanceTo(origin))
                .ToList();

            for (int i = 0; i < sorted.Count; i++)
            {
                if (i < maxVisible)
                    sorted[i].Show();
                else
                    sorted[i].Hide();
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        void SetStatus(string message)
        {
            if (statusLabel != null) statusLabel.text = message;
            Debug.Log($"[ARbnb] {message}");
        }

        /// Returns all loaded annotation data — used by WaypointNavigator.
        public List<AnnotationData> GetAllAnnotations() =>
            _panels.Select(p => p.Data).ToList();
    }
}
