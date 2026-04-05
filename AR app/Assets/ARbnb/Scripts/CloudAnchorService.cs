using System;
using System.Threading.Tasks;
using Google.XR.ARCoreExtensions;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using ARCloudAnchor = Google.XR.ARCoreExtensions.ARCloudAnchor;

namespace ARbnb
{
    /// <summary>
    /// Thin wrapper around ARCore Extensions Cloud Anchor API.
    ///
    /// ARCore Extensions returns Promise types (not C# Tasks), so we poll
    /// promise.State each frame via Task.Yield() to bridge into async/await.
    ///
    /// Scene wiring:
    ///   - anchorManager → AR Anchor Manager on the XR Origin GameObject
    /// </summary>
    public class CloudAnchorService : MonoBehaviour
    {
        [SerializeField] ARAnchorManager anchorManager;

        // ── Hosting ──────────────────────────────────────────────────────────

        /// <summary>
        /// Creates a temporary local anchor at <paramref name="worldPos"/>, hosts it
        /// as a Google Cloud Anchor (TTL 1 day), and returns the cloud anchor ID.
        /// Returns null on failure.
        /// </summary>
        public async Task<string> HostAnchorAsync(Vector3 worldPos)
        {
            if (anchorManager == null)
            {
                Debug.LogError("[CloudAnchor] ARAnchorManager not assigned.");
                return null;
            }

            // Create a local anchor at the annotation's estimated world position
            var anchorGo = new GameObject("CloudAnchorHost_Temp");
            anchorGo.transform.SetPositionAndRotation(worldPos, Quaternion.identity);
            var localAnchor = anchorGo.AddComponent<ARAnchor>();

            // One frame for AR Foundation to register the new anchor
            await Task.Yield();

            try
            {
                var promise = anchorManager.HostCloudAnchorAsync(localAnchor, ttlDays: 1);

                // Poll each frame until the promise resolves
                while (promise.State == PromiseState.Pending)
                    await Task.Yield();

                if (promise.Result.CloudAnchorState == CloudAnchorState.Success)
                {
                    Debug.Log($"[CloudAnchor] Hosted: {promise.Result.CloudAnchorId}");
                    return promise.Result.CloudAnchorId;
                }

                Debug.LogWarning($"[CloudAnchor] Hosting failed: {promise.Result.CloudAnchorState}");
                return null;
            }
            catch (Exception e)
            {
                Debug.LogError($"[CloudAnchor] HostAnchorAsync exception: {e.Message}");
                return null;
            }
            finally
            {
                Destroy(anchorGo);
            }
        }

        // ── Resolving ────────────────────────────────────────────────────────

        /// <summary>
        /// Resolves a previously-hosted anchor by ID. Returns the live ARAnchor
        /// (keep it alive — ARCore continues refining its pose), or null on failure.
        /// </summary>
        public async Task<ARCloudAnchor> ResolveAnchorAsync(string cloudAnchorId)
        {
            if (anchorManager == null)
            {
                Debug.LogError("[CloudAnchor] ARAnchorManager not assigned.");
                return null;
            }

            if (string.IsNullOrEmpty(cloudAnchorId))
                return null;

            try
            {
                var promise = anchorManager.ResolveCloudAnchorAsync(cloudAnchorId);

                while (promise.State == PromiseState.Pending)
                    await Task.Yield();

                if (promise.Result.CloudAnchorState == CloudAnchorState.Success)
                {
                    Debug.Log($"[CloudAnchor] Resolved: {cloudAnchorId}");
                    return promise.Result.Anchor;
                }

                Debug.LogWarning($"[CloudAnchor] Resolve failed for '{cloudAnchorId}': {promise.Result.CloudAnchorState}");
                return null;
            }
            catch (Exception e)
            {
                Debug.LogError($"[CloudAnchor] ResolveAnchorAsync exception: {e.Message}");
                return null;
            }
        }
    }
}
