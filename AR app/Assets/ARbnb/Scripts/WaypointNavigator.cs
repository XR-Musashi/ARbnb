using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ARbnb
{
    /// <summary>
    /// Displays a world-space arrow pointing toward a chosen destination room.
    ///
    /// Scene wiring:
    ///   - arrowObject         → 3D arrow mesh (child of this GameObject)
    ///   - destinationDropdown → TMP_Dropdown listing available room labels
    ///   - annotationManager   → reference to AnnotationManager
    ///
    /// The arrow billboard-rotates to always face the camera on its Y axis,
    /// then tilts to point toward the target annotation in world space.
    /// </summary>
    public class WaypointNavigator : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] GameObject arrowObject;
        [SerializeField] TMP_Dropdown destinationDropdown;
        [SerializeField] AnnotationManager annotationManager;

        [Header("Settings")]
        [SerializeField] float arrowDistance = 1.5f;  // metres in front of camera
        [SerializeField] float arrowHeight = 0f;       // offset from camera height

        Vector3 _targetPosition;
        bool _hasTarget = false;
        Camera _cam;
        List<AnnotationData> _destinations = new();

        void Start()
        {
            _cam = Camera.main;
            arrowObject.SetActive(false);

            if (destinationDropdown != null)
                destinationDropdown.onValueChanged.AddListener(OnDestinationChanged);
        }

        /// Call this after annotations are loaded to populate the dropdown.
        public void PopulateDestinations(List<AnnotationData> annotations)
        {
            _destinations = annotations
                .Where(a => !string.IsNullOrEmpty(a.RoomLabel) && a.HasWorldPosition)
                .GroupBy(a => a.RoomLabel)
                .Select(g => g.First())
                .ToList();

            if (destinationDropdown == null) return;

            var options = new List<string> { "— Navigate to… —" };
            options.AddRange(_destinations.Select(a => FormatLabel(a.RoomLabel)));
            destinationDropdown.ClearOptions();
            destinationDropdown.AddOptions(options);
        }

        void OnDestinationChanged(int index)
        {
            if (index == 0)
            {
                _hasTarget = false;
                arrowObject.SetActive(false);
                return;
            }

            var dest = _destinations[index - 1]; // offset by the placeholder
            _targetPosition = dest.ToUnityPosition();
            _hasTarget = true;
            arrowObject.SetActive(true);
        }

        void Update()
        {
            if (!_hasTarget || _cam == null) return;

            // Position arrow in front of the camera at a fixed distance
            var camTransform = _cam.transform;
            var arrowPos = camTransform.position
                + camTransform.forward * arrowDistance
                + Vector3.up * arrowHeight;
            arrowObject.transform.position = arrowPos;

            // Point arrow toward target (ignore Y for horizontal-only direction)
            var flatDirection = _targetPosition - arrowPos;
            flatDirection.y = 0f;

            if (flatDirection.sqrMagnitude > 0.001f)
            {
                var targetRot = Quaternion.LookRotation(flatDirection);
                arrowObject.transform.rotation = Quaternion.Slerp(
                    arrowObject.transform.rotation, targetRot, Time.deltaTime * 8f);
            }

            // Hide arrow when very close to destination
            float dist = Vector3.Distance(
                new Vector3(_cam.transform.position.x, 0, _cam.transform.position.z),
                new Vector3(_targetPosition.x, 0, _targetPosition.z));
            arrowObject.SetActive(dist > 0.8f);
        }

        static string FormatLabel(string label) =>
            System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(
                label.Replace("_", " "));
    }
}
