using System.Collections;
using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ARbnb
{
    /// <summary>
    /// Screen-space HUD that reveals room labels as the guest physically
    /// enters each room (moves within triggerRadius of an annotation in that room).
    ///
    /// Scene wiring:
    ///   - hudPanel       → parent UI panel (CanvasGroup, Screen Space Overlay)
    ///   - roomEntryText  → TMP_Text that flashes the room name on discovery
    ///   - discoveredList → TMP_Text showing all discovered rooms so far
    /// </summary>
    public class DiscoveryHUD : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] CanvasGroup hudPanel;
        [SerializeField] TMP_Text roomEntryText;
        [SerializeField] TMP_Text discoveredListText;

        [Header("Settings")]
        [SerializeField] float triggerRadius = 2.5f;   // metres
        [SerializeField] float flashDuration = 2.5f;   // seconds to show room name
        [SerializeField] float checkInterval = 0.75f;  // seconds between checks

        List<AnnotationData> _annotations = new();
        HashSet<string> _discovered = new();
        Camera _cam;
        float _checkTimer;

        void Start()
        {
            _cam = Camera.main;
            hudPanel.alpha = 0f;
            roomEntryText.text = "";
            discoveredListText.text = "";
        }

        /// Call after annotations are loaded.
        public void Initialise(List<AnnotationData> annotations)
        {
            _annotations = annotations
                .Where(a => !string.IsNullOrEmpty(a.RoomLabel) && a.HasWorldPosition)
                .ToList();
        }

        void Update()
        {
            _checkTimer -= Time.deltaTime;
            if (_checkTimer > 0f) return;
            _checkTimer = checkInterval;
            CheckProximity();
        }

        void CheckProximity()
        {
            if (_cam == null || _annotations.Count == 0) return;

            var camPos = _cam.transform.position;

            foreach (var ann in _annotations)
            {
                if (_discovered.Contains(ann.RoomLabel)) continue;

                float dist = Vector3.Distance(camPos, ann.ToUnityPosition());
                if (dist <= triggerRadius)
                {
                    DiscoverRoom(ann.RoomLabel);
                }
            }
        }

        void DiscoverRoom(string roomLabel)
        {
            _discovered.Add(roomLabel);
            Debug.Log($"[ARbnb] Discovered room: {roomLabel}");

            var formatted = FormatLabel(roomLabel);
            StartCoroutine(FlashRoomName(formatted));
            UpdateDiscoveredList();
        }

        IEnumerator FlashRoomName(string name)
        {
            roomEntryText.text = name;
            yield return StartCoroutine(FadeHud(1f, 0.3f));
            yield return new WaitForSeconds(flashDuration);
            yield return StartCoroutine(FadeHud(0f, 0.5f));
            roomEntryText.text = "";
        }

        IEnumerator FadeHud(float target, float duration)
        {
            float start = hudPanel.alpha;
            float elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                hudPanel.alpha = Mathf.Lerp(start, target, elapsed / duration);
                yield return null;
            }
            hudPanel.alpha = target;
        }

        void UpdateDiscoveredList()
        {
            var labels = _discovered.Select(FormatLabel);
            discoveredListText.text = "Explored: " + string.Join(", ", labels);
        }

        static string FormatLabel(string label) =>
            System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(
                label.Replace("_", " "));
    }
}
