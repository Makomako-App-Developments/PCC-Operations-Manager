let _id: string | null = null;

export function setLastAssetId(id: string | null) {
  _id = id;
}

export function getLastAssetId(): string | null {
  return _id;
}
