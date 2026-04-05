using System.Collections;
using TMPro;
using UnityEngine;

namespace ARbnb
{
    /// <summary>
    /// A world-space floating annotation panel.
    /// Always faces the camera (billboard). Fades in/out when shown or hidden.
    ///
    /// Prefab structure:
    ///   AnnotationPanel (this script)
    ///     └─ Canvas (World Space, scale ~0.002)
    ///          ├─ Background  (Image)
    ///          ├─ TitleText   (TMP_Text)
    ///          └─ ContentText (TMP_Text)
    /// </summary>
    [RequireComponent(typeof(CanvasGroup))]
    public class AnnotationPanel : MonoBehaviour
    {
        [SerializeField] TMP_Text titleText;
        [SerializeField] TMP_Text contentText;

        [SerializeField] float fadeDuration = 0.3f;

        CanvasGroup _canvasGroup;
        Camera _mainCamera;
        bool _visible = false;

        public AnnotationData Data { get; private set; }

        void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
            _canvasGroup.alpha = 0f;
            gameObject.SetActive(false);
        }

        void Start()
        {
            _mainCamera = Camera.main;
        }

        void LateUpdate()
        {
            // Billboard: always face the camera
            if (_mainCamera != null)
                transform.rotation = Quaternion.LookRotation(
                    _mainCamera.transform.position - transform.position);
        }

        // ── Public API ───────────────────────────────────────────────────────

        public void Initialise(AnnotationData data)
        {
            Data = data;
            titleText.text = data.Title;
            contentText.text = data.Content;
            name = $"AnnotationPanel_{data.Id}";
        }

        public void Show()
        {
            if (_visible) return;
            _visible = true;
            gameObject.SetActive(true);
            _canvasGroup.alpha = 1f;
            Debug.Log($"[ARbnb] Panel '{name}' shown at world pos {transform.position}, canvas local Z: {GetComponentInChildren<Canvas>()?.transform.localPosition.z}");
        }

        public void Hide()
        {
            if (!_visible) return;
            _visible = false;
            StopAllCoroutines();
            StartCoroutine(FadeAndDeactivate());
        }

        public float DistanceTo(Vector3 point) =>
            Vector3.Distance(transform.position, point);

        /// <summary>
        /// Parents this panel to a resolved cloud anchor so ARCore's ongoing pose
        /// refinement is reflected automatically. Call after ResolveAnchorAsync succeeds.
        /// </summary>
        public void SnapToAnchor(Transform anchorTransform)
        {
            transform.SetParent(anchorTransform, worldPositionStays: false);
            transform.localPosition = Vector3.zero;
        }

        // ── Fade helpers ─────────────────────────────────────────────────────

        IEnumerator Fade(float target)
        {
            float start = _canvasGroup.alpha;
            float elapsed = 0f;
            while (elapsed < fadeDuration)
            {
                elapsed += Time.deltaTime;
                _canvasGroup.alpha = Mathf.Lerp(start, target, elapsed / fadeDuration);
                yield return null;
            }
            _canvasGroup.alpha = target;
        }

        IEnumerator FadeAndDeactivate()
        {
            yield return Fade(0f);
            gameObject.SetActive(false);
        }
    }
}
