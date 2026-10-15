import { useEffect, useState } from "react";

const FALLBACK = "/images/image-placeholder.svg";

function safeSource(source?: string | null): string {
  if (!source) return FALLBACK;
  if (source.startsWith("blob:")) return source;
  try {
    const url = new URL(source, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : FALLBACK;
  } catch { return FALLBACK; }
}

export function Image({ src, alt, className, loading = "lazy" }: { src?: string | null; alt: string; className?: string; loading?: "lazy" | "eager" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const source = failed ? FALLBACK : safeSource(src);
  return <img src={source} alt={alt} className={className} loading={loading} onError={() => setFailed(true)} />;
}
