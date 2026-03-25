using System.Collections.Generic;
using Newtonsoft.Json;
using UnityEngine;

namespace ARbnb
{
    public class AnnotationData
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("content")]
        public string Content { get; set; }

        [JsonProperty("roomLabel")]
        public string RoomLabel { get; set; }

        // 3D position from the Three.js dashboard (Y-up, right-handed)
        [JsonProperty("worldX")]
        public float? WorldX { get; set; }

        [JsonProperty("worldY")]
        public float? WorldY { get; set; }

        // Stored as Three.js Z — must negate when converting to Unity
        [JsonProperty("worldZ")]
        public float? WorldZ { get; set; }

        [JsonProperty("cloudAnchor")]
        public CloudAnchorData CloudAnchor { get; set; }

        public bool HasWorldPosition => WorldX.HasValue && WorldY.HasValue && WorldZ.HasValue;

        // Three.js (right-handed Y-up) → Unity (left-handed Y-up): negate Z
        public Vector3 ToUnityPosition() =>
            new Vector3(WorldX ?? 0f, WorldY ?? 0f, -(WorldZ ?? 0f));
    }

    public class CloudAnchorData
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("cloudAnchorId")]
        public string CloudAnchorId { get; set; }

        [JsonProperty("expiresAt")]
        public string ExpiresAt { get; set; }
    }

    public class PropertyData
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("address")]
        public string Address { get; set; }
    }

    public class SessionMeResponse
    {
        [JsonProperty("session")]
        public SessionInfo Session { get; set; }

        [JsonProperty("property")]
        public PropertyData Property { get; set; }
    }

    public class SessionInfo
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("propertyId")]
        public string PropertyId { get; set; }
    }

    public class PostAnchorRequest
    {
        [JsonProperty("annotationId")]
        public string AnnotationId { get; set; }

        [JsonProperty("cloudAnchorId")]
        public string CloudAnchorId { get; set; }

        [JsonProperty("worldX")]
        public float WorldX { get; set; }

        [JsonProperty("worldY")]
        public float WorldY { get; set; }

        [JsonProperty("worldZ")]
        public float WorldZ { get; set; }
    }
}
