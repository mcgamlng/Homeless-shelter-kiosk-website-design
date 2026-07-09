async function request(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(path, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  getActivities(includeInactive = false) {
    return request(`/api/activities${includeInactive ? "?includeInactive=true" : ""}`);
  },
  getDashboard(token) {
    return request("/api/dashboard", {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  getSettings() {
    return request("/api/settings");
  },
  getAccessInfo() {
    return request("/api/access-info");
  },
  getSpeechStatus() {
    return request("/api/speech/status");
  },
  testNetwork(token, url) {
    return request("/api/admin/network/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url })
    });
  },
  createCheckIn(payload) {
    return request("/api/check-ins", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  inspectNameCheckIn(payload) {
    return request("/api/sign-in/inspect", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  async verifyNameSignIn(payload) {
    const data = await request("/api/sign-in/verify", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!data.ok) {
      throw new Error(data.error || "That name is not signed up yet.");
    }
    return data;
  },
  updateStatus(token, id, status) {
    return request(`/api/scheduled-items/${id}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
  },
  moveItem(token, id, direction) {
    return request(`/api/scheduled-items/${id}/move`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ direction })
    });
  },
  rescheduleItem(token, id, targetStart) {
    return request(`/api/scheduled-items/${id}/reschedule`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetStart })
    });
  },
  reorderCheckIn(token, id, orderedIds) {
    return request(`/api/check-ins/${id}/reorder`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderedIds })
    });
  },
  clearCheckIn(token, id) {
    return request(`/api/check-ins/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  adminLogin(pin) {
    return request("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({ pin })
    });
  },
  getAdminSecurity(token) {
    return request("/api/admin/security", {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  changeAdminPin(token, payload) {
    return request("/api/admin/security/pin", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
  },
  resetDay(token, seedDemo = false) {
    return request("/api/admin/reset-day", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seedDemo })
    });
  },
  clearActive(token) {
    return request("/api/admin/clear-active", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  getAnalytics(token, period, date) {
    const params = new URLSearchParams({ period, date });
    return request(`/api/admin/analytics?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  async exportAnalytics(token, period, date) {
    const params = new URLSearchParams({ period, date });
    const response = await fetch(`/api/admin/analytics/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error || "Excel export could not be created.");
      error.status = response.status;
      throw error;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    return {
      blob,
      filename: match?.[1] || `listening-house-analytics-${period}-${date}.xlsx`
    };
  },
  createAnalyticsExportLink(token, period, date) {
    return request("/api/admin/analytics/export-link", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ period, date })
    });
  },
  getExportSettings(token) {
    return request("/api/admin/export-settings", {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  updateExportSettings(token, settings) {
    return request("/api/admin/export-settings", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(settings)
    });
  },
  getDailyExports(token) {
    return request("/api/admin/daily-exports", {
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  runDailyExport(token, payload = {}) {
    return request("/api/admin/daily-exports/run", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
  },
  testDailyExportEmail(token) {
    return request("/api/admin/daily-exports/test-email", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  exitKiosk(token) {
    return request("/api/admin/system/exit-kiosk", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  openKiosk(token) {
    return request("/api/admin/system/open-kiosk", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  updateFromGithub(token) {
    return request("/api/admin/system/update", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  rebootPi(token) {
    return request("/api/admin/system/reboot", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  openKioskOnThisPi() {
    return request("/api/system/open-kiosk", {
      method: "POST"
    });
  },
  getDailyExportDownloadUrl(token, id) {
    return `/api/admin/daily-exports/${id}/download?${new URLSearchParams({ token }).toString()}`;
  },
  getAnalyticsExportUrl(token, period, date) {
    const params = new URLSearchParams({ period, date, token });
    return `/api/admin/analytics/export?${params.toString()}`;
  },
  createActivity(token, activity) {
    return request("/api/admin/activities", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(activity)
    });
  },
  translateActivityName(token, name) {
    return request("/api/admin/activity-translations", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name })
    });
  },
  applyListeningHouseDefaults(token) {
    return request("/api/admin/activities/apply-listening-house-defaults", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  updateActivity(token, id, activity) {
    return request(`/api/admin/activities/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(activity)
    });
  },
  deleteActivity(token, id) {
    return request(`/api/admin/activities/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
  },
  updateSetting(token, key, value) {
    return request(`/api/admin/settings/${key}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ value })
    });
  },
  updateSettings(token, settings) {
    return request("/api/admin/settings", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ settings })
    });
  }
};
