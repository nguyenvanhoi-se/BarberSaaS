import { useEffect, useState } from "react";

const FALLBACK = "/images/image-placeholder.svg";

function safeSource(source?: string | null, fallback = FALLBACK): string {
  if (!source) return fallback;
  if (source.startsWith("blob:")) return source;
  try {
    const url = new URL(source, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
  } catch { return fallback; }
}

export function Image({ src, alt, className, loading = "lazy", fallbackSrc = FALLBACK }: { src?: string | null; alt: string; className?: string; loading?: "lazy" | "eager"; fallbackSrc?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const source = failed ? fallbackSrc : safeSource(src, fallbackSrc);
  return <img src={source} alt={alt} className={className} loading={loading} onError={() => setFailed(true)} />;
}
