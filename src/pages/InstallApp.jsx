import {
  Apple,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  Globe2,
  Share2,
  Smartphone,
  Wifi
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function InstallApp() {
  const [accessInfo, setAccessInfo] = useState(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const dashboardUrl = accessInfo?.browserUrl || "";
  const platform =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("platform");
  const isAndroidInstall = platform === "android";

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

  async function copyDashboardLink() {
    if (!dashboardUrl) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyMessage("Copy did not work. Press and hold the link below to copy it.");
      return;
    }
    try {
      await navigator.clipboard.writeText(dashboardUrl);
      setCopyMessage("Dashboard link copied.");
    } catch {
      setCopyMessage("Copy did not work. Press and hold the link below to copy it.");
    }
  }

  return (
    <section className="install-page">
      <div className="page-heading">
        <h1>Install Listening House Check-In</h1>
        <p>
          {isAndroidInstall
            ? "Download the Android app, then connect it to this server."
            : "Use the staff dashboard like an app on iPhone, iPad, or Android."}
        </p>
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

      {isAndroidInstall ? (
        <AndroidInstallHero accessInfo={accessInfo} />
      ) : (
        <IphoneInstallHero
          copyDashboardLink={copyDashboardLink}
          copyMessage={copyMessage}
          dashboardUrl={dashboardUrl}
        />
      )}

      <div className="install-platform-grid">
        <article className="install-platform">
          <Smartphone size={38} />
          <h2>iPhone or iPad</h2>
          <p>
            Scan the iPhone QR code on the About page or open this install page directly. Safari
            creates the app icon on the Home Screen.
          </p>
          <a className="primary-button" href="/dashboard">
            <ExternalLink size={18} />
            Open staff dashboard
          </a>
          <p className="install-platform-note">
            If staff are away from the building Wi-Fi, first configure the public HTTPS address in
            Admin.
          </p>
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

function IphoneInstallHero({ copyDashboardLink, copyMessage, dashboardUrl }) {
  return (
    <article className="ios-install-hero">
      <div className="ios-install-main">
        <div className="ios-install-title">
          <Apple size={42} />
          <div>
            <h2>iPhone and iPad quick install</h2>
            <p>
              iPhone does not download an APK file. It installs this system as a Home Screen web app
              through Safari.
            </p>
          </div>
        </div>

        <ol className="ios-install-steps">
          <li>
            <span className="ios-step-number">1</span>
            <div>
              <strong>Open this page in Safari.</strong>
              <span>If it opens in Chrome, Google, or Messenger, choose Open in Safari.</span>
            </div>
          </li>
          <li>
            <span className="ios-step-number">2</span>
            <div>
              <strong>Open the dashboard link.</strong>
              <span>The Home Screen app will remember this server address.</span>
            </div>
          </li>
          <li>
            <span className="ios-step-number">3</span>
            <div>
              <strong>
                Tap <Share2 size={17} aria-hidden="true" /> Share, then Add to Home Screen.
              </strong>
              <span>Leave Open as Web App on, then tap Add.</span>
            </div>
          </li>
        </ol>

        <div className="ios-install-actions">
          <a className="primary-button" href="/dashboard">
            <ExternalLink size={18} />
            Open dashboard for iPhone install
          </a>
          <button
            className="secondary-button"
            type="button"
            onClick={copyDashboardLink}
            disabled={!dashboardUrl}
          >
            <Clipboard size={18} />
            Copy dashboard link
          </button>
        </div>
        {copyMessage ? <p className="install-copy-message">{copyMessage}</p> : null}
        <code className="ios-dashboard-link">
          {dashboardUrl || "Finding the dashboard link for this server..."}
        </code>
      </div>

      <div className="ios-install-phone-card" aria-label="iPhone install preview">
        <div className="ios-phone-top" />
        <div className="ios-phone-icon">
          <Apple size={30} />
        </div>
        <strong>Add to Home Screen</strong>
        <span>Listening House Check-In</span>
        <code>{dashboardUrl || "Finding dashboard link..."}</code>
      </div>
    </article>
  );
}

function AndroidInstallHero({ accessInfo }) {
  const downloadUrl = accessInfo?.appDownloadUrl || "/downloads/ListeningHouseKiosk-debug.apk";
  const connectUrl = accessInfo?.androidConfigureUrl || "";

  return (
    <article className="ios-install-hero android-install-hero">
      <div className="ios-install-main">
        <div className="ios-install-title">
          <Download size={42} />
          <div>
            <h2>Android app install</h2>
            <p>
              Scan the Android QR code to open this page. First download the APK, then connect the
              installed app to this server.
            </p>
          </div>
        </div>

        <ol className="ios-install-steps">
          <li>
            <span className="ios-step-number">1</span>
            <div>
              <strong>Press Download Android app.</strong>
              <span>
                If Chrome says the file cannot be downloaded securely, press Keep. The download
                should be the APK app file, not a tiny web page.
              </span>
            </div>
          </li>
          <li>
            <span className="ios-step-number">2</span>
            <div>
              <strong>Open the downloaded APK file.</strong>
              <span>
                Android may ask to allow this install source. Allow it only for this Listening House
                app install.
              </span>
            </div>
          </li>
          <li>
            <span className="ios-step-number">3</span>
            <div>
              <strong>Return here and press Connect installed app.</strong>
              <span>The app saves this server address so staff do not have to type it in.</span>
            </div>
          </li>
        </ol>

        <div className="ios-install-actions">
          <a className="primary-button" href={downloadUrl} download>
            <Download size={18} />
            Download Android app
          </a>
          {connectUrl ? (
            <a className="secondary-button" href={connectUrl}>
              <Smartphone size={18} />
              Connect installed app
            </a>
          ) : null}
        </div>
        <code className="ios-dashboard-link">
          {downloadUrl || "Finding the Android app download for this server..."}
        </code>
      </div>

      <div
        className="ios-install-phone-card android-install-phone-card"
        aria-label="Android install preview"
      >
        <div className="ios-phone-top" />
        <div className="ios-phone-icon">
          <Download size={30} />
        </div>
        <strong>Download APK</strong>
        <span>Then connect this server</span>
        <code>{accessInfo?.selectedServerUrl || "Finding server address..."}</code>
      </div>
    </article>
  );
}
