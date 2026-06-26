import { useEffect, useState } from "react";
import {
  Apple,
  Download,
  HeartHandshake,
  ListChecks,
  QrCode,
  Smartphone,
  UsersRound
} from "lucide-react";
import QRCode from "qrcode";
import { api } from "../api.js";

export default function About() {
  const [accessInfo, setAccessInfo] = useState(null);
  const [browserQr, setBrowserQr] = useState("");
  const [appQr, setAppQr] = useState("");
  const [iphoneQr, setIphoneQr] = useState("");

  useEffect(() => {
    let active = true;
    api
      .getAccessInfo()
      .then(async (info) => {
        if (!active) return;
        setAccessInfo(info);
        const [browserImage, appImage, iphoneImage] = await Promise.all([
          QRCode.toDataURL(info.browserUrl, { width: 320, margin: 2, color: qrColors }),
          QRCode.toDataURL(info.appDownloadUrl, { width: 320, margin: 2, color: qrColors }),
          QRCode.toDataURL(info.iphoneInstallUrl, { width: 320, margin: 2, color: qrColors })
        ]);
        if (active) {
          setBrowserQr(browserImage);
          setAppQr(appImage);
          setIphoneQr(iphoneImage);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="about-page">
      <div className="page-heading">
        <h1>Listening House Guest Check-In System</h1>
        <p>
          This prototype supports a name-based check-in and service scheduling system for Listening
          House guests and staff.
        </p>
      </div>

      <div className="about-grid">
        <article className="about-card">
          <HeartHandshake />
          <h2>Purpose of the kiosk</h2>
          <p>
            Guests enter only their first and last name, choose a language, and select the support
            they need through a simple touchscreen flow.
          </p>
        </article>
        <article className="about-card">
          <UsersRound />
          <h2>How names work</h2>
          <p>
            Every guest uses the same Sign In / Sign Up button. A new first-and-last-name
            combination is signed up automatically, while a saved name is treated as a returning
            sign-in.
          </p>
        </article>
        <article className="about-card">
          <ListChecks />
          <h2>How staff use the dashboard</h2>
          <p>
            Staff see names, services, timed calendar blocks, untimed requests, daily limits, and
            progress. Optional staff timer alerts count down from In Progress and warn staff when a
            timed activity is almost finished.
          </p>
        </article>
        <article className="about-card">
          <Smartphone />
          <h2>Why it helps</h2>
          <p>
            The system helps reduce waiting lines, organize daily services, and give guests a calmer
            way to move through the day with dignity and clarity.
          </p>
        </article>
      </div>

      <section className="access-qr-section">
        <div className="access-qr-heading">
          <QrCode size={30} />
          <div>
            <h2>Open on a phone or tablet</h2>
            <p>
              Scan a code to open or install the system. A configured public address works from any
              internet connection.
            </p>
          </div>
        </div>
        <div className="access-qr-grid">
          <QrAccessCard
            image={browserQr}
            title="Open in a browser"
            description="Works on iPhone, iPad, Android, laptops, and desktop browsers."
            url={accessInfo?.browserUrl}
          />
          <QrAccessCard
            image={iphoneQr}
            title="Install on iPhone or iPad"
            description="Opens the iPhone installation page with Add to Home Screen instructions."
            url={accessInfo?.iphoneInstallUrl}
            icon="apple"
          />
          <QrAccessCard
            image={appQr}
            title="Download the Android app"
            description="Downloads the Listening House Android app that opens this local system."
            url={accessInfo?.appDownloadUrl}
            download
          />
        </div>
      </section>
    </section>
  );
}

function QrAccessCard({ image, title, description, url, download = false, icon = "phone" }) {
  return (
    <article className="qr-access-card">
      <div className="qr-image-frame">
        {image ? (
          <img src={image} alt={`QR code for ${title}`} />
        ) : (
          <span>Preparing QR code...</span>
        )}
      </div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {url ? (
          <a className="secondary-button" href={url} download={download || undefined}>
            {download ? (
              <Download size={18} />
            ) : icon === "apple" ? (
              <Apple size={18} />
            ) : (
              <Smartphone size={18} />
            )}
            {download ? "Download app" : "Open website"}
          </a>
        ) : null}
        <code>{url || "Finding the server address..."}</code>
      </div>
    </article>
  );
}

const qrColors = {
  dark: "#22356D",
  light: "#FFFDF7"
};
