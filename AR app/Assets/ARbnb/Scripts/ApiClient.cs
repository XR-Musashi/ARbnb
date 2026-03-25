using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;

namespace ARbnb
{
    /// <summary>
    /// Thin HTTP wrapper around UnityWebRequest.
    /// All methods run asynchronously on the Unity main thread.
    /// Set ApiClient.BaseUrl and ApiClient.GuestToken before calling any method.
    /// </summary>
    public static class ApiClient
    {
        // Set these before use — ARbnbSession sets them on successful login
        public static string BaseUrl = "http://10.0.2.2:3000"; // 10.0.2.2 = localhost from Android emulator
        public static string GuestToken = "";

        // ── Core HTTP helpers ────────────────────────────────────────────────

        static async Task<string> SendAsync(UnityWebRequest req)
        {
            if (!string.IsNullOrEmpty(GuestToken))
                req.SetRequestHeader("Authorization", $"Bearer {GuestToken}");

            req.SetRequestHeader("Accept", "application/json");
            req.SendWebRequest();

            while (!req.isDone)
                await Task.Yield();

            if (req.result != UnityWebRequest.Result.Success)
                throw new Exception($"HTTP {req.responseCode}: {req.error} — {req.downloadHandler?.text}");

            return req.downloadHandler.text;
        }

        static async Task<T> GetAsync<T>(string path)
        {
            using var req = UnityWebRequest.Get($"{BaseUrl}{path}");
            var json = await SendAsync(req);
            return JsonConvert.DeserializeObject<T>(json);
        }

        static async Task<T> PostAsync<T>(string path, object body)
        {
            var json = JsonConvert.SerializeObject(body);
            var bytes = Encoding.UTF8.GetBytes(json);
            using var req = new UnityWebRequest($"{BaseUrl}{path}", "POST")
            {
                uploadHandler = new UploadHandlerRaw(bytes),
                downloadHandler = new DownloadHandlerBuffer()
            };
            req.SetRequestHeader("Content-Type", "application/json");
            var responseJson = await SendAsync(req);
            return JsonConvert.DeserializeObject<T>(responseJson);
        }

        // ── API methods ──────────────────────────────────────────────────────

        /// Validate the guest token and return session + property info.
        public static Task<SessionMeResponse> GetSessionAsync() =>
            GetAsync<SessionMeResponse>("/api/sessions/me");

        /// Fetch all annotations for a property.
        public static Task<List<AnnotationData>> GetAnnotationsAsync(string propertyId) =>
            GetAsync<List<AnnotationData>>($"/api/properties/{propertyId}/annotations");

        /// Store a hosted Google Cloud Anchor ID against an annotation.
        public static Task<object> PostAnchorAsync(PostAnchorRequest request) =>
            PostAsync<object>("/api/anchors", request);

        /// Health check — useful for debugging connectivity.
        public static async Task<bool> PingAsync()
        {
            try
            {
                using var req = UnityWebRequest.Get($"{BaseUrl}/health");
                var json = await SendAsync(req);
                return json.Contains("ok");
            }
            catch
            {
                return false;
            }
        }
    }
}
