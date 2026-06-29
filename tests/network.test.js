import assert from "node:assert/strict";
import test from "node:test";
import { createAccessInfo, normalizeServerBaseUrl } from "../server/network.js";

const interfaces = {
  WiFi: [
    {
      address: "192.168.10.24",
      family: "IPv4",
      internal: false
    }
  ],
  Loopback: [
    {
      address: "127.0.0.1",
      family: "IPv4",
      internal: true
    }
  ]
};

test("normalizes local and public server addresses to their origin", () => {
  assert.equal(normalizeServerBaseUrl("192.168.10.24:3000/dashboard"), "http://192.168.10.24:3000");
  assert.equal(
    normalizeServerBaseUrl("https://checkin.example.org/admin"),
    "https://checkin.example.org"
  );
  assert.equal(normalizeServerBaseUrl("ftp://example.org"), "");
});

test("uses the selected active local network address", () => {
  const info = createAccessInfo({
    requestBase: "http://localhost:3000",
    requestHostname: "localhost",
    port: 3000,
    networkSettings: {
      mode: "local",
      preferred_local_url: "http://192.168.10.24:3000"
    },
    networkInterfaces: interfaces
  });

  assert.equal(info.activeMode, "local");
  assert.equal(info.baseUrl, "http://192.168.10.24:3000");
  assert.equal(info.preferredLocalAvailable, true);
  assert.equal(info.networkOptions[0].interfaceName, "WiFi");
});

test("uses a configured public address only in public mode", () => {
  const info = createAccessInfo({
    requestBase: "http://localhost:3000",
    requestHostname: "localhost",
    port: 3000,
    networkSettings: {
      mode: "public",
      public_base_url: "https://checkin.example.org"
    },
    networkInterfaces: interfaces
  });

  assert.equal(info.activeMode, "public");
  assert.equal(info.baseUrl, "https://checkin.example.org");
  assert.equal(info.localBaseUrl, "http://192.168.10.24:3000");
});

test("falls back to local mode when public mode has no public address", () => {
  const info = createAccessInfo({
    requestBase: "http://localhost:3000",
    requestHostname: "localhost",
    port: 3000,
    networkSettings: { mode: "public" },
    networkInterfaces: interfaces
  });

  assert.equal(info.requestedMode, "public");
  assert.equal(info.activeMode, "local");
  assert.equal(info.baseUrl, "http://192.168.10.24:3000");
});
