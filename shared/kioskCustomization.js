export const DEFAULT_KIOSK_CUSTOMIZATION = {
  organization_name: "The Listening House",
  system_name: "Guest check-in system",
  kiosk_welcome_title: "Welcome to Listening House",
  kiosk_welcome_subtitle:
    "A simple check-in system designed around safety, connection, and practical support.",
  kiosk_name_entry_title: "Sign In / Sign Up",
  kiosk_name_entry_help:
    "Enter first and last name. New names are signed up automatically; saved names are signed in.",
  kiosk_check_in_button: "Sign In / Sign Up",
  kiosk_language_title: "Choose your preferred language.",
  kiosk_activity_title: "What do you need today?",
  kiosk_activity_subtitle: "Choose the support you need today.",
  kiosk_confirmation_message: "Thank you, and please wait for your name to be called.",
  kiosk_finish_button: "Finish",
  kiosk_background_color: "#8BC9C2",
  kiosk_screen_color: "#202020",
  kiosk_primary_color: "#9B6BAA",
  kiosk_accent_color: "#22356D",
  kiosk_card_color: "#A7D2CD",
  kiosk_selected_color: "#9B6BAA",
  kiosk_text_color: "#FFFFFF",
  kiosk_button_text_color: "#FFFFFF"
};

export const KIOSK_CUSTOMIZATION_KEYS = Object.keys(DEFAULT_KIOSK_CUSTOMIZATION);

export const KIOSK_COLOR_KEYS = KIOSK_CUSTOMIZATION_KEYS.filter((key) => key.endsWith("_color"));

const welcomeTemplates = {
  en: (name) => `Welcome to ${name}`,
  es: (name) => `Bienvenido a ${name}`,
  hmn: (name) => `Zoo siab txais tos rau ${name}`,
  so: (name) => `Ku soo dhawoow ${name}`
};

export function getKioskCustomization(settings = {}) {
  const source = settings.customization || settings;
  return KIOSK_CUSTOMIZATION_KEYS.reduce((acc, key) => {
    const value = source?.[key];
    acc[key] =
      value === undefined || value === null || value === ""
        ? DEFAULT_KIOSK_CUSTOMIZATION[key]
        : String(value);
    return acc;
  }, {});
}

export function normalizeKioskColor(value, fallback = "#000000") {
  const candidate = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
}

export function getKioskCssVariables(settings = {}) {
  const customization = getKioskCustomization(settings);
  return {
    "--lh-aqua": normalizeKioskColor(
      customization.kiosk_background_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_background_color
    ),
    "--lh-aqua-light": normalizeKioskColor(
      customization.kiosk_card_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_card_color
    ),
    "--lh-soft-green": normalizeKioskColor(
      customization.kiosk_card_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_card_color
    ),
    "--lh-kiosk-card": normalizeKioskColor(
      customization.kiosk_card_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_card_color
    ),
    "--lh-purple": normalizeKioskColor(
      customization.kiosk_primary_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_primary_color
    ),
    "--lh-golden-yellow": normalizeKioskColor(
      customization.kiosk_selected_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_selected_color
    ),
    "--lh-kiosk-selected": normalizeKioskColor(
      customization.kiosk_selected_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_selected_color
    ),
    "--lh-navy": normalizeKioskColor(
      customization.kiosk_accent_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_accent_color
    ),
    "--lh-deep-green": normalizeKioskColor(
      customization.kiosk_accent_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_accent_color
    ),
    "--lh-kiosk-screen": normalizeKioskColor(
      customization.kiosk_screen_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_screen_color
    ),
    "--lh-kiosk-text": normalizeKioskColor(
      customization.kiosk_text_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_text_color
    ),
    "--lh-kiosk-button-text": normalizeKioskColor(
      customization.kiosk_button_text_color,
      DEFAULT_KIOSK_CUSTOMIZATION.kiosk_button_text_color
    )
  };
}

export function getCustomizedKioskText(baseTranslations = {}, settings = {}, language = "en") {
  const customization = getKioskCustomization(settings);
  const text = { ...baseTranslations };
  const organizationName = customization.organization_name.trim();
  const welcomeTemplate = welcomeTemplates[language] || welcomeTemplates.en;

  if (organizationName) {
    text.welcome = welcomeTemplate(organizationName);
  }

  if (language === "en") {
    text.welcome = customization.kiosk_welcome_title || text.welcome;
    text.kioskPurpose = customization.kiosk_welcome_subtitle || text.kioskPurpose;
    text.chooseLanguage = customization.kiosk_language_title || text.chooseLanguage;
    text.nameEntryTitle = customization.kiosk_name_entry_title || text.nameEntryTitle;
    text.nameEntryHelp = customization.kiosk_name_entry_help || text.nameEntryHelp;
    text.checkInButton = customization.kiosk_check_in_button || text.checkInButton;
    text.needToday = customization.kiosk_activity_title || text.needToday;
    text.chooseSupport = customization.kiosk_activity_subtitle || text.chooseSupport;
    text.staffWillCall = customization.kiosk_confirmation_message || text.staffWillCall;
    text.finish = customization.kiosk_finish_button || text.finish;
  }

  return text;
}
