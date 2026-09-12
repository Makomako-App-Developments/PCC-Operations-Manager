import type { AttachmentSource } from "./attachmentUpload";

export async function pickWebCameraPhoto(): Promise<AttachmentSource | null> {
  if (typeof document === "undefined") {
    throw new Error("Camera capture is not available in this browser.");
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.display = "none";

    const cleanup = () => {
      input.remove();
      window.removeEventListener("focus", handleWindowFocus);
    };
    const handleWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) {
          cleanup();
          resolve(null);
        }
      }, 300);
    };

    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      resolve({
        uri: URL.createObjectURL(file),
        file,
        fileName: file.name || `camera-${Date.now()}.jpg`,
        mimeType: file.type || "image/jpeg",
        fileSize: file.size,
      });
    };
    input.onerror = () => {
      cleanup();
      reject(new Error("The browser could not open the camera."));
    };

    document.body.appendChild(input);
    window.addEventListener("focus", handleWindowFocus);
    input.click();
  });
}