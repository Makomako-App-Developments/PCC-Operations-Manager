import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { customFetch } from "@workspace/api-client-react";

type AuthenticatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  loadingClassName?: string;
  unavailableClassName?: string;
};

type LocalImagePreviewProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  file: File;
};

type AuthenticatedMediaLinkProps = {
  src: string;
  children: ReactNode;
  className?: string;
  unavailableMessage?: string;
};

const OBJECT_URL_REVOKE_DELAY_MS = 60_000;

export function LocalImagePreview({ file, alt = "", ...imageProps }: LocalImagePreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const createdUrl = URL.createObjectURL(file);
    setObjectUrl(createdUrl);

    return () => URL.revokeObjectURL(createdUrl);
  }, [file]);

  if (!objectUrl) return null;

  return <img {...imageProps} src={objectUrl} alt={alt} />;
}

export function AuthenticatedMediaLink({
  src,
  children,
  className,
  unavailableMessage = "Attachment unavailable",
}: AuthenticatedMediaLinkProps) {
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  const openMedia = async () => {
    if (opening) return;

    const newTab = window.open("", "_blank");
    if (!newTab) {
      setFailed(true);
      return;
    }

    setOpening(true);
    setFailed(false);
    try {
      const blob = await customFetch<Blob>(src, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(blob);
      newTab.location.replace(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
    } catch {
      newTab.close();
      setFailed(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void openMedia()}
        disabled={opening}
        className={className}
        aria-busy={opening}
      >
        {children}
      </button>
      {failed && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {unavailableMessage}
        </p>
      )}
    </div>
  );
}

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