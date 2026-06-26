import { Download, Share2, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function InstallApp() {
  const [accessInfo, setAccessInfo] = useState(null);

  useEffect(() => {
    api
      .getAccessInfo()
      .then(setAccessInfo)
      .catch(() => undefined);
  }, []);

  return (
    <section className="install-page">
      <div className="page-heading">
        <h1>Install Listening House Check-In</h1>
        <p>Use the staff dashboard like an app on iPhone, iPad, or Android.</p>
      </div>

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
            Download the lightweight Android app, then enter the public or local server address.
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
        </article>
      </div>
    </section>
  );
}
