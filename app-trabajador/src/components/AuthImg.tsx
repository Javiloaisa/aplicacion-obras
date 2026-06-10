import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

/**
 * <img> for authenticated endpoints: plain img tags cannot send the JWT
 * header, so fetch the blob and render an object URL.
 */
export default function AuthImg({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    apiFetch(src)
      .then((res) => res.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {
        // Thumbnail may still be generating; leave the placeholder
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!url) {
    return <div className={`animate-pulse bg-gray-300 ${className}`} aria-label={alt} />;
  }
  return <img src={url} alt={alt} className={className} />;
}
