import { useEffect } from "react";
import type { PublicShop } from "../api/public-api";

const DEFAULTS = {
  "--primary-color": "#111111",
  "--secondary-color": "#282522",
  "--accent-color": "#c79a5b",
};

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{3}(?:[0-9a-f]{3}|[0-9a-f]{5})?$/iu.test(value.trim()) ? value.trim() : fallback;
}

function safeFont(value: string | undefined): string {
  const allowed = new Map([["inter", "Inter"], ["arial", "Arial"], ["georgia", "Georgia"], ["system-ui", "system-ui"]]);
  return allowed.get(value?.trim().toLowerCase() ?? "") ?? "Inter";
}

export function useTenantTheme(shop: PublicShop | null) {
  useEffect(() => {
    const root = document.documentElement;
    const settings = shop?.settings ?? {};
    const values = {
      "--primary-color": safeColor(settings.primary_color, DEFAULTS["--primary-color"]),
      "--secondary-color": safeColor(settings.secondary_color, DEFAULTS["--secondary-color"]),
      "--accent-color": safeColor(settings.accent_color, DEFAULTS["--accent-color"]),
      "--shop-font": safeFont(settings.font),
    };
    const previous = Object.keys(values).map((key) => [key, root.style.getPropertyValue(key)] as const);
    for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value);
    return () => {
      for (const [key, value] of previous) {
        if (value) root.style.setProperty(key, value);
        else root.style.removeProperty(key);
      }
    };
  }, [shop]);
}
