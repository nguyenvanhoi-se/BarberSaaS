import { useEffect } from "react";
import type { PublicShop } from "../api/public-api";

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function safeImage(value?: string | null): string {
  if (!value) return `${window.location.origin}/images/barbershop-hero.svg`;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : `${window.location.origin}/images/barbershop-hero.svg`;
  } catch { return `${window.location.origin}/images/barbershop-hero.svg`; }
}

export function useTenantSeo(shop: PublicShop | null, pageTitle?: string, pageDescription?: string) {
  useEffect(() => {
    if (!shop) return;
    const settings = shop.settings;
    const title = pageTitle ? `${pageTitle} | ${shop.name}` : shop.name;
    const description = pageDescription || settings.hero_description || shop.description || `${shop.name} — services, barbers and opening hours.`;
    const image = safeImage(settings.hero_image || shop.cover_url);
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", image);
    let icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.appendChild(icon); }
    icon.href = safeImage(settings.favicon || shop.logo_url);
    const canonicalHost=shop.canonical_domain;
    if(canonicalHost){
      let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if(!canonical){canonical=document.createElement("link");canonical.rel="canonical";document.head.appendChild(canonical);}
      canonical.href=`https://${canonicalHost}${window.location.pathname}`;
    }
  }, [shop, pageTitle, pageDescription]);
}
