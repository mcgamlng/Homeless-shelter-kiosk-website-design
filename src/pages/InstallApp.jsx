import { CheckCircle2, Download, Globe2, Share2, Smartphone, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function InstallApp() {
  const [accessInfo, setAccessInfo] = useState(null);
  const [error, setError] = useState("");

  function loadAccessInfo() {
    setError("");
    api
      .getAccessInfo()
      .then(setAccessInfo)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadAccessInfo();
  }, []);

  return (
    <section className="install-page">
      <div className="page-heading">
        <h1>Install Listening House Check-In</h1>
        <p>Use the staff dashboard like an app on iPhone, iPad, or Android.</p>
      </div>

      <div className="install-connection-banner">
        {accessInfo?.activeMode === "public" ? <Globe2 /> : <Wifi />}
        <div>
          <strong>
            {accessInfo?.activeMode === "public"
              ? "Public internet connection"
              : "Local Wi-Fi connection"}
          </strong>
          <span>
            {accessInfo?.activeMode === "public"
              ? "This address can work from any internet connection."
              : `Phones must join ${accessInfo?.wifiName || "the same Wi-Fi as this server"}.`}
          </span>
          <code>{accessInfo?.selectedServerUrl || "Finding the selected server address..."}</code>
        </div>
        {accessInfo ? <CheckCircle2 aria-label="Connection information ready" /> : null}
      </div>
      {error ? (
        <div className="install-error">
          <p>{error}</p>
          <button className="secondary-button" type="button" onClick={loadAccessInfo}>
            Try again
          </button>
        </div>
      ) : null}

      <div className="install-platform-grid">
        <article className="install-platform">
          <Smartphone size={38} />
          <h2>iPhone or iPad</h2>
          <ol>
            <li>Open this page in Safari.</li>
            <li>
              Tap <Share2 size={18} aria-hidden="true" /> Share.
            </li>
            <li>Choose Add to Home Screen.</li>
            <li>Turn on Open as Web App, then tap Add.</li>
          </ol>
          <a className="primary-button" href="/dashboard">
            Open staff dashboard
          </a>
        </article>

        <article className="install-platform">
          <Download size={38} />
          <h2>Android</h2>
          <p>
            Download the lightweight Android app, then connect it to the selected server address.
          </p>
          <a
            className="primary-button"
            href={accessInfo?.appDownloadUrl || "/downloads/ListeningHouseKiosk-debug.apk"}
            download
          >
            <Download size={18} />
            Download Android app
          </a>
          {accessInfo?.androidConfigureUrl ? (
            <a className="secondary-button" href={accessInfo.androidConfigureUrl}>
              <Smartphone size={18} />
              Connect installed app to this server
            </a>
          ) : null}
          <p className="install-platform-note">
            Install the app first. Then return to this page and press Connect installed app.
          </p>
        </article>
      </div>
    </section>
  );
}
