export function isImageAttachment(contentType: string | null | undefined): boolean {
  return contentType?.trim().toLowerCase().startsWith("image/") === true;
}