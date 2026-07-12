import { useEffect, useState } from "react";
import {
  Apple,
  Download,
  HeartHandshake,
  ListChecks,
  Mail,
  Phone,
  QrCode,
  Save,
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
  const [inventorContact, setInventorContact] = useState({ phone: "", email: "" });
  const [contactDraft, setContactDraft] = useState({ phone: "", email: "" });
  const [canEditContact, setCanEditContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactMessage, setContactMessage] = useState("");

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

  useEffect(() => {
    let active = true;
    api
      .getSettings()
      .then((settings) => {
        if (!active) return;
        const contact = settings.inventorContact || {};
        const nextContact = { phone: contact.phone || "", email: contact.email || "" };
        setInventorContact(nextContact);
        setContactDraft(nextContact);
      })
      .catch(() => {});

    const token = sessionStorage.getItem("lh-admin-token") || "";
    if (token) {
      api
        .getStaffSession(token, "admin_customization")
        .then(() => {
          if (active) setCanEditContact(true);
        })
        .catch(() => {
          if (active) setCanEditContact(false);
        });
    }
    return () => {
      active = false;
    };
  }, []);

  async function saveInventorContact(event) {
    event.preventDefault();
    const token = sessionStorage.getItem("lh-admin-token") || "";
    if (!token) {
      setContactMessage("Sign in with Admin access before saving inventor contact information.");
      return;
    }
    setSavingContact(true);
    setContactMessage("");
    try {
      const settings = await api.updateSettings(token, {
        inventor_contact_phone: contactDraft.phone,
        inventor_contact_email: contactDraft.email
      });
      const contact = settings.inventorContact || {};
      const nextContact = { phone: contact.phone || "", email: contact.email || "" };
      setInventorContact(nextContact);
      setContactDraft(nextContact);
      setContactMessage("Inventor contact saved on this system.");
    } catch (err) {
      setContactMessage(err.message || "Inventor contact could not be saved.");
    } finally {
      setSavingContact(false);
    }
  }

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
            description="Scan with the iPhone camera, open in Safari, then add the dashboard to the Home Screen."
            url={accessInfo?.iphoneInstallUrl}
            icon="apple"
            actionLabel="Open iPhone install"
          />
          <QrAccessCard
            image={appQr}
            title="Download the Android app"
            description="Downloads the Listening House Android app that opens this local system."
            url={accessInfo?.appDownloadUrl}
            download
            extraUrl={accessInfo?.androidConfigureUrl}
            extraLabel="Connect installed app"
          />
        </div>
        <div className="iphone-install-callout">
          <Apple size={24} />
          <div>
            <strong>iPhone installs from Safari, not from an APK download.</strong>
            <span>
              Open the iPhone QR code, tap the dashboard button, then use Share and Add to Home
              Screen. The new icon opens this system like an app.
            </span>
          </div>
        </div>
      </section>

      <section className="inventor-contact-section">
        <div className="access-qr-heading">
          <HeartHandshake size={30} />
          <div>
            <h2>Contact the Inventor</h2>
            <p>Save the phone number and email staff should use when they need project help.</p>
          </div>
        </div>

        <div className="inventor-contact-grid">
          <article className="inventor-contact-card">
            <h3>Saved contact</h3>
            {inventorContact.phone || inventorContact.email ? (
              <div className="inventor-contact-links">
                {inventorContact.phone ? (
                  <a href={`tel:${inventorContact.phone}`}>
                    <Phone size={18} />
                    {inventorContact.phone}
                  </a>
                ) : null}
                {inventorContact.email ? (
                  <a href={`mailto:${inventorContact.email}`}>
                    <Mail size={18} />
                    {inventorContact.email}
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="contact-empty">No inventor contact has been saved yet.</p>
            )}
          </article>

          <article className="inventor-contact-card">
            <h3>Update contact information</h3>
            {canEditContact ? (
              <form className="inventor-contact-form" onSubmit={saveInventorContact}>
                <label>
                  Phone number
                  <input
                    type="tel"
                    value={contactDraft.phone}
                    onChange={(event) =>
                      setContactDraft((current) => ({ ...current, phone: event.target.value }))
                    }
                    placeholder="Example: 555-555-1234"
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={contactDraft.email}
                    onChange={(event) =>
                      setContactDraft((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="name@example.com"
                  />
                </label>
                <button className="primary-button" type="submit" disabled={savingContact}>
                  <Save size={18} />
                  {savingContact ? "Saving..." : "Save inventor contact"}
                </button>
              </form>
            ) : (
              <p className="contact-empty">
                Sign in with Admin access to update this contact. Staff with About access can still
                view the saved phone number and email.
              </p>
            )}
            {contactMessage ? <p className="contact-save-message">{contactMessage}</p> : null}
          </article>
        </div>
      </section>
    </section>
  );
}

function QrAccessCard({
  image,
  title,
  description,
  url,
  download = false,
  icon = "phone",
  extraUrl = "",
  extraLabel = "",
  actionLabel = ""
}) {
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
            {actionLabel || (download ? "Download app" : "Open website")}
          </a>
        ) : null}
        {extraUrl ? (
          <a className="secondary-button light-button" href={extraUrl}>
            <Smartphone size={18} />
            {extraLabel || "Open installed app"}
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
