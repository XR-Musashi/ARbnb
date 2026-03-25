// Editor-only build post-processor.
// Adds android:usesCleartextTraffic="true" to the merged AndroidManifest
// so the AR app can reach the backend over plain HTTP on the LAN.
#if UNITY_ANDROID
using System.IO;
using System.Xml;
using UnityEditor.Android;

namespace ARbnb.Editor
{
    public class AndroidManifestPatcher : IPostGenerateGradleAndroidProject
    {
        public int callbackOrder => 1;

        public void OnPostGenerateGradleAndroidProject(string gradleProjectPath)
        {
            var manifestPath = Path.Combine(gradleProjectPath, "src", "main", "AndroidManifest.xml");
            if (!File.Exists(manifestPath)) return;

            var doc = new XmlDocument();
            doc.Load(manifestPath);

            var ns = "http://schemas.android.com/apk/res/android";
            var app = doc.SelectSingleNode("/manifest/application");
            if (app == null) return;

            // Only add if not already present
            if (app.Attributes["android:usesCleartextTraffic"] == null)
            {
                var attr = doc.CreateAttribute("android", "usesCleartextTraffic", ns);
                attr.Value = "true";
                app.Attributes.Append(attr);
            }

            doc.Save(manifestPath);
        }
    }
}
#endif
