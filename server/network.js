import { execFileSync } from "node:child_process";
import os from "node:os";

const WIFI_CACHE_MS = 15_000;
let cachedWifi = { checkedAt: 0, name: "" };

export function normalizeServerBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

export function getNetworkOptions(port, networkInterfaces = os.networkInterfaces()) {
  return Object.entries(networkInterfaces)
    .flatMap(([interfaceName, addresses]) =>
      (addresses || [])
        .filter(
          (address) =>
            address &&
            address.family === "IPv4" &&
            !address.internal &&
            !address.address.startsWith("169.254.")
        )
        .map((address) => ({
          interfaceName,
          address: address.address,
          url: `http://${address.address}:${port}`,
          label: `${interfaceName} - ${address.address}`
        }))
    )
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function getWifiName() {
  if (Date.now() - cachedWifi.checkedAt < WIFI_CACHE_MS) return cachedWifi.name;

  let name = "";
  try {
    if (process.platform === "win32") {
      const output = execFileSync("netsh.exe", ["wlan", "show", "interfaces"], {
        encoding: "utf8",
        timeout: 1500,
        windowsHide: true
      });
      const match = output.match(/^\s*SSID\s*:\s*(.+)\s*$/im);
      name = match?.[1]?.trim() || "";
    } else if (process.platform === "linux") {
      const output = execFileSync("nmcli", ["-t", "-f", "active,ssid", "dev", "wifi"], {
        encoding: "utf8",
        timeout: 1500
      });
      name =
        output
          .split(/\r?\n/)
          .find((line) => line.startsWith("yes:"))
          ?.slice(4)
          .trim() || "";
    } else if (process.platform === "darwin") {
      const output = execFileSync(
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
        ["-I"],
        { encoding: "utf8", timeout: 1500 }
      );
      name = output.match(/^\s*SSID:\s*(.+)\s*$/im)?.[1]?.trim() || "";
    }
  } catch {
    name = "";
  }

  cachedWifi = { checkedAt: Date.now(), name };
  return name;
}

export function createAccessInfo({
  requestBase,
  requestHostname,
  port,
  environmentPublicUrl = "",
  networkSettings = {},
  networkInterfaces
}) {
  const networkOptions = getNetworkOptions(port, networkInterfaces);
  const addresses = networkOptions.map((option) => option.url);
  const preferredLocalUrl = normalizeServerBaseUrl(networkSettings.preferred_local_url);
  const configuredPublicUrl = normalizeServerBaseUrl(
    environmentPublicUrl || networkSettings.public_base_url
  );
  const normalizedRequestBase = normalizeServerBaseUrl(requestBase);
  const requestedHost = String(requestHostname || "").toLowerCase();
  const requestIsLocalhost = ["localhost", "127.0.0.1", "::1"].includes(requestedHost);
  const requestIsActiveAddress = networkOptions.some(
    (option) => option.address.toLowerCase() === requestedHost
  );
  const preferredIsActive = networkOptions.some((option) => option.url === preferredLocalUrl);
  const localBaseUrl =
    (preferredIsActive && preferredLocalUrl) ||
    (!requestIsLocalhost && requestIsActiveAddress && normalizedRequestBase) ||
    networkOptions[0]?.url ||
    normalizedRequestBase;
  const requestedMode =
    String(networkSettings.mode || "").toLowerCase() === "public" ? "public" : "local";
  const publicReady = Boolean(configuredPublicUrl);
  const activeMode = requestedMode === "public" && publicReady ? "public" : "local";
  const baseUrl = activeMode === "public" ? configuredPublicUrl : localBaseUrl;

  return {
    baseUrl,
    activeMode,
    requestedMode,
    localBaseUrl,
    publicBaseUrl: configuredPublicUrl || null,
    publicReady,
    preferredLocalUrl: preferredLocalUrl || null,
    preferredLocalAvailable: preferredIsActive,
    networkOptions,
    addresses
  };
}
