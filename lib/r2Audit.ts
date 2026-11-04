export type StoredObject = {
  key: string;
  size: number;
  etag: string;
  modifiedAt: string | null;
};

export type FileReference = { url: string; label: string };

export function auditStorage(objects: StoredObject[], references: FileReference[], publicBaseUrl: string) {
  const base = new URL(`${publicBaseUrl.replace(/\/+$/, "")}/`);
  const referencesByKey = new Map<string, string[]>();
  let externalReferences = 0;
  const invalidReferences: FileReference[] = [];
  for (const reference of references) {
    if (!reference.url?.trim()) continue;
    try {
      const url = new URL(reference.url);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
        externalReferences++;
        continue;
      }
      const key = decodeURIComponent(url.pathname.slice(base.pathname.length));
      const labels = referencesByKey.get(key) ?? [];
      labels.push(reference.label);
      referencesByKey.set(key, labels);
    } catch {
      invalidReferences.push(reference);
    }
  }
  const inventory = objects.map((object) => ({ ...object, references: referencesByKey.get(object.key) ?? [] }));
  const bySize = (a: { size: number }, b: { size: number }) => b.size - a.size;
  const unused = inventory.filter((object) => object.references.length === 0).sort(bySize);
  const fingerprints = new Map<string, typeof inventory>();
  let fingerprintUncheckedCount = 0;
  for (const object of inventory) {
    const etag = object.etag.replaceAll('"', "").toLowerCase();
    // Multipart ETags do not identify the content independently of upload layout.
    if (!/^[a-f0-9]{32}$/.test(etag)) { fingerprintUncheckedCount++; continue; }
    const signature = `${object.size}:${etag}`;
    const matches = fingerprints.get(signature) ?? [];
    matches.push(object);
    fingerprints.set(signature, matches);
  }
  const duplicates = [...fingerprints.values()]
    .filter((group) => group.length > 1)
    .map((files) => ({ files: files.sort(bySize), redundantBytes: files[0].size * (files.length - 1) }))
    .sort((a, b) => b.redundantBytes - a.redundantBytes);
  // Union of reclaimable candidates: count unreferenced objects once, then only
  // additional referenced copies within each duplicate group.
  const unusedBytes = unused.reduce((sum, object) => sum + object.size, 0);
  const consolidationBytes = duplicates.reduce((sum, group) => {
    const referencedCopies = group.files.filter((file) => file.references.length > 0).length;
    return sum + Math.max(0, referencedCopies - 1) * group.files[0].size;
  }, 0);
  const keys = new Set(objects.map((object) => object.key));
  const missing = [...referencesByKey].filter(([key]) => !keys.has(key))
    .map(([key, labels]) => ({ key, references: labels }));
  const categories = ["brstm-files/", "previews/"] .map((prefix) => ({
    prefix,
    bytes: objects.filter((object) => object.key.startsWith(prefix)).reduce((sum, object) => sum + object.size, 0),
    count: objects.filter((object) => object.key.startsWith(prefix)).length,
  }));
  return {
    measuredAt: new Date().toISOString(),
    objectCount: objects.length,
    usedBytes: objects.reduce((sum, object) => sum + object.size, 0),
    categories,
    unusedCount: unused.length,
    unusedBytes,
    duplicateGroups: duplicates.length,
    duplicateExtraBytes: duplicates.reduce((sum, group) => sum + group.redundantBytes, 0),
    reclaimableCandidateBytes: unusedBytes + consolidationBytes,
    fingerprintUncheckedCount,
    externalReferences,
    sharedObjects: inventory.filter((object) => object.references.length > 1).sort(bySize),
    unused,
    duplicates,
    missing,
    invalidReferences,
  };
}
