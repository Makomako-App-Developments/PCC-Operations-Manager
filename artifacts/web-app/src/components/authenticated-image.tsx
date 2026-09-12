import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { customFetch } from "@workspace/api-client-react";

type AuthenticatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  loadingClassName?: string;
  unavailableClassName?: string;
};

export function AuthenticatedImage({
  src,
  alt = "",
  className = "",
  loadingClassName,
  unavailableClassName,
  ...imageProps
}: AuthenticatedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let createdUrl: string | null = null;

    setObjectUrl(null);
    setFailed(false);

    void customFetch<Blob>(src, { responseType: "blob", signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={unavailableClassName ?? `${className} flex items-center justify-center bg-gray-100 p-2 text-center text-xs text-gray-500`}
      >
        Photo unavailable
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        aria-label={alt ? `Loading ${alt}` : "Loading photo"}
        className={loadingClassName ?? `${className} animate-pulse bg-gray-100`}
      />
    );
  }

  return <img {...imageProps} src={objectUrl} alt={alt} className={className} />;
}