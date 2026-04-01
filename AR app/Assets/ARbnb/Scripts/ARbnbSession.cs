using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.Management;

namespace ARbnb
{
    /// <summary>
    /// Entry point for the guest AR session.
    /// Shows a token-entry UI on start; on successful validation hides it
    /// and hands off to AnnotationManager.
    ///
    /// Scene wiring:
    ///   - LoginCanvas       (Canvas, Screen Space Overlay)
    ///     - TokenInputField  (TMP_InputField)
    ///     - ConnectButton    (Button)
    ///     - StatusLabel      (TMP_Text)
    ///   - AnnotationManager  (GameObject with AnnotationManager component)
    /// </summary>
    public class ARbnbSession : MonoBehaviour
    {
        [Header("Backend")]
        [Tooltip("Base URL of the Node.js API. Use 10.0.2.2:3000 for Android emulator, your machine's LAN IP for a real device.")]
        [SerializeField] string apiBaseUrl = "http://localhost:3000";

        [Header("Login UI")]
        [SerializeField] GameObject loginCanvas;
        [SerializeField] TMP_InputField tokenInputField;
        [SerializeField] Button connectButton;
        [SerializeField] TMP_Text statusLabel;

        [Header("Dependencies")]
        [SerializeField] AnnotationManager annotationManager;

        // Public read — other scripts can access the current property
        public static string PropertyId { get; private set; }
        public static PropertyData CurrentProperty { get; private set; }

        void Start()
        {
            ApiClient.BaseUrl = apiBaseUrl;
            loginCanvas.SetActive(true);
            connectButton.onClick.AddListener(OnConnectClicked);

            // Auto-fill last used token in editor for quick iteration
#if UNITY_EDITOR
            tokenInputField.text = PlayerPrefs.GetString("arbnb_last_token", "");
#endif


            StartCoroutine(LogARSessionState());
            StartCoroutine(DiagnoseXRInit());
        }

        IEnumerator LogARSessionState()
        {
            while (true)
            {
                Debug.Log($"[ARbnb] AR Session state: {ARSession.state}, notTracking reason: {ARSession.notTrackingReason}");
                yield return new WaitForSeconds(2f);
            }
        }

        IEnumerator DiagnoseXRInit()
        {
            yield return new WaitForSeconds(0.5f);

            var xrSettings = XRGeneralSettings.Instance;
            Debug.Log($"[ARbnb] XRGeneralSettings.Instance: {(xrSettings != null ? xrSettings.name : "NULL")}");
            if (xrSettings == null) yield break;

            var mgr = xrSettings.Manager;
            Debug.Log($"[ARbnb] XR Manager: {(mgr != null ? mgr.name : "NULL")}");
            if (mgr == null) yield break;

            var loaders = mgr.activeLoaders;
            Debug.Log($"[ARbnb] Configured loaders: {loaders?.Count ?? 0}");
            if (loaders != null)
                foreach (var l in loaders)
                    Debug.Log($"[ARbnb]   loader: {(l != null ? l.name + " (" + l.GetType().Name + ")" : "NULL")}");

            Debug.Log($"[ARbnb] activeLoader: {(mgr.activeLoader != null ? mgr.activeLoader.name : "NULL")}");

            if (mgr.activeLoader == null)
            {
                Debug.Log("[ARbnb] Calling InitializeLoaderSync()...");
                mgr.InitializeLoaderSync();
                yield return null;
                Debug.Log($"[ARbnb] After init, activeLoader: {(mgr.activeLoader != null ? mgr.activeLoader.name : "NULL")}");
            }

            if (mgr.activeLoader != null)
            {
                Debug.Log("[ARbnb] Calling StartSubsystems()");
                mgr.StartSubsystems();

                yield return null; // one frame for subsystems to register

                var arSession = FindAnyObjectByType<ARSession>(FindObjectsInactive.Include);
                if (arSession == null)
                {
                    Debug.LogWarning("[ARbnb] No ARSession in scene — creating one dynamically. Add AR Session to the scene in the Unity Editor for a proper fix.");
                    var go = new GameObject("AR Session (dynamic)");
                    arSession = go.AddComponent<ARSession>();
                }
                else
                {
                    // ARSession's OnEnable ran before subsystems were ready — re-trigger it
                    Debug.Log($"[ARbnb] Re-triggering ARSession.OnEnable on '{arSession.name}'");
                    arSession.enabled = false;
                    yield return null;
                    arSession.enabled = true;
                }
            }
        }

        async void OnConnectClicked()
        {
            var token = tokenInputField.text.Trim();
            if (string.IsNullOrEmpty(token))
            {
                SetStatus("Please enter your guest token.", Color.red);
                return;
            }

            connectButton.interactable = false;
            SetStatus("Connecting…", Color.white);

            try
            {
                ApiClient.GuestToken = token;
                var response = await ApiClient.GetSessionAsync();

                PropertyId = response.Session.PropertyId;
                CurrentProperty = response.Property;

#if UNITY_EDITOR
                PlayerPrefs.SetString("arbnb_last_token", token);
#endif
                SetStatus($"Welcome to {response.Property?.Name ?? "the property"}!", Color.green);
                await System.Threading.Tasks.Task.Delay(800);

                loginCanvas.SetActive(false);
                annotationManager.LoadAnnotations(PropertyId);
            }
            catch (Exception e)
            {
                Debug.LogError($"[ARbnb] Session error: {e.Message}");
                SetStatus("Invalid token or server unreachable.", Color.red);
                connectButton.interactable = true;
                ApiClient.GuestToken = "";
            }
        }

        void SetStatus(string message, Color color)
        {
            if (statusLabel == null) return;
            statusLabel.text = message;
            statusLabel.color = color;
        }
    }
}
