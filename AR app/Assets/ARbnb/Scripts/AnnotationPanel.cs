using TMPro;
using UnityEngine;

namespace ARbnb
{
    /// <summary>
    /// A world-space floating annotation panel built from 3D primitives and
    /// TextMeshPro (mesh-based, not UGUI) so it reliably renders in URP AR.
    ///
    /// The panel is built procedurally in Awake — no Canvas required.
    ///
    /// Prefab structure (minimal — just this script on root):
    ///   AnnotationPanel (this script)
    ///
    /// Optional Inspector overrides for title/content TMP are kept so the prefab
    /// can still reference hand-crafted TMP children if desired later.
    /// </summary>
    public class AnnotationPanel : MonoBehaviour
    {
        // Width / height of the floating card in metres (at scale 1 on the root transform)
        [SerializeField] float cardWidth    = 0.35f;
        [SerializeField] float cardHeight   = 0.22f;
        // Scale of TMP child transforms — directly controls world-space text size.
        // Increase these to make text bigger; no rebuild needed to understand direction.
        [SerializeField] float titleScale   = 0.006f;
        [SerializeField] float contentScale = 0.004f;

        /// <summary>
        /// A URP-compatible material for the background quad.
        /// Create one in the Editor: Assets → Create → Material, set shader to
        /// "Universal Render Pipeline/Unlit", pick a dark colour, assign here.
        /// If null the quad will render purple (legacy default material).
        /// </summary>
        [SerializeField] Material backgroundMaterial;

        Camera _mainCamera;
        bool   _visible = false;

        TextMeshPro _titleTmp;
        TextMeshPro _contentTmp;
        GameObject  _background;

        public AnnotationData Data { get; private set; }

        // ── Lifecycle ────────────────────────────────────────────────────────

        void Awake()
        {
            transform.localScale = Vector3.one; // override any stale prefab scale
            BuildCard();
            gameObject.SetActive(false);
        }

        void Start()
        {
            _mainCamera = Camera.main;
        }

        void LateUpdate()
        {
            if (_mainCamera == null) return;
            // Face the camera: panel's local -Z toward camera.
            // TextMeshPro 3D renders its readable face on the -Z side;
            // the BackFace quad (rotated 180°) is what the camera sees.
            transform.rotation = Quaternion.LookRotation(
                transform.position - _mainCamera.transform.position);
        }

        // ── Public API ───────────────────────────────────────────────────────

        public void Initialise(AnnotationData data)
        {
            Data = data;
            if (_titleTmp   != null) _titleTmp.text   = data.Title;
            if (_contentTmp != null) _contentTmp.text = data.Content;
            name = $"AnnotationPanel_{data.Id}";
        }

        public void Show()
        {
            if (_visible) return;
            _visible = true;
            gameObject.SetActive(true);
            Debug.Log($"[ARbnb] Panel '{name}' shown at {transform.position}");
        }

        public void Hide()
        {
            if (!_visible) return;
            _visible = false;
            gameObject.SetActive(false);
        }

        public float DistanceTo(Vector3 point) =>
            Vector3.Distance(transform.position, point);

        /// <summary>Parents this panel to a resolved cloud anchor.</summary>
        public void SnapToAnchor(Transform anchorTransform)
        {
            transform.SetParent(anchorTransform, worldPositionStays: false);
            transform.localPosition = Vector3.zero;
        }

        // ── Card builder ─────────────────────────────────────────────────────

        void BuildCard()
        {
            // --- Background quad -------------------------------------------
            _background = GameObject.CreatePrimitive(PrimitiveType.Quad);
            _background.name = "Background";
            _background.transform.SetParent(transform, worldPositionStays: false);
            _background.transform.localPosition = Vector3.zero;
            _background.transform.localScale = new Vector3(cardWidth, cardHeight, 1f);

            // Destroy the collider — annotation panels don't need physics
            Destroy(_background.GetComponent<MeshCollider>());

            // Second quad facing the opposite direction for double-sided appearance
            var back = GameObject.CreatePrimitive(PrimitiveType.Quad);
            back.name = "BackFace";
            back.transform.SetParent(transform, worldPositionStays: false);
            back.transform.localPosition = new Vector3(0f, 0f, -0.001f); // 1 mm behind front
            back.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
            back.transform.localScale = new Vector3(cardWidth, cardHeight, 1f);
            Destroy(back.GetComponent<MeshCollider>());

            // Apply the URP material assigned in Inspector; fall back gracefully.
            if (backgroundMaterial != null)
            {
                _background.GetComponent<Renderer>().sharedMaterial = backgroundMaterial;
                back.GetComponent<Renderer>().sharedMaterial = backgroundMaterial;
            }

            // --- Title (upper half) ----------------------------------------
            // -0.003 on Z = in front of the background toward the camera
            // (panel -Z faces camera, so negative local Z = closer to camera)
            _titleTmp = CreateTMPChild("TitleText",
                new Vector3(0f,  cardHeight * 0.22f, -0.003f),
                scale: titleScale,
                bold: true);

            _contentTmp = CreateTMPChild("ContentText",
                new Vector3(0f, -cardHeight * 0.15f, -0.003f),
                scale: contentScale,
                bold: false);
        }

        TextMeshPro CreateTMPChild(string childName, Vector3 localPos,
                                   float scale, bool bold)
        {
            var go = new GameObject(childName);
            go.transform.SetParent(transform, worldPositionStays: false);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.identity;
            // Scale directly controls world-space text size — independent of TMP unit system
            go.transform.localScale = Vector3.one * scale;

            var tmp = go.AddComponent<TextMeshPro>();
            tmp.fontSize           = 36;   // fixed reference size in TMP points
            tmp.alignment          = TextAlignmentOptions.Center;
            tmp.color              = Color.white;
            tmp.fontStyle          = bold ? FontStyles.Bold : FontStyles.Normal;
            tmp.enableWordWrapping = true;
            tmp.enableAutoSizing   = false;
            tmp.overflowMode       = TextOverflowModes.Truncate;
            // Convert card world-space dimensions to TMP local units (world / scale)
            // so word-wrap triggers at the card edge, not at some huge default rect.
            tmp.rectTransform.sizeDelta = new Vector2(
                cardWidth * 0.85f / scale,
                cardHeight        / scale);

            return tmp;
        }
    }
}
