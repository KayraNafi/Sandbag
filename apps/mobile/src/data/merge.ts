/**
 * The server's copy wins unless this phone has a change of its own still to send: one that wasn't in this
 * request, or was made while it was in flight. So whatever the server fixes in a document (a data migration,
 * like renaming lifts) reaches every phone, even under the same stamp.
 */
export function mergeDocs<T extends { id: string; updatedAt: number }>(
  local: Record<string, T>, dirty: string[], incoming: T[], sent: Map<string, number>,
): { docs: Record<string, T>; dirty: string[] } {
  const unsent = dirty.filter((id) => {
    const stamp = sent.get(id);
    return stamp === undefined || local[id]?.updatedAt !== stamp;
  });
  const docs = { ...local };
  for (const doc of incoming) {
    const mine = docs[doc.id];
    if (!mine || doc.updatedAt > mine.updatedAt || (doc.updatedAt === mine.updatedAt && !unsent.includes(doc.id))) docs[doc.id] = doc;
  }
  return { docs, dirty: unsent };
}
