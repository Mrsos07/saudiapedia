import { APIError, type CollectionBeforeValidateHook } from 'payload';

export const MAX_ARTICLE_AUTHORS = 20;

/** Private associations only; never include these fields in public article DTOs. */
export type EditorialRelations = { categoryRef?: unknown; authors?: unknown };
export type EditorialArticleDocument = EditorialRelations & { id: number | string; section?: unknown };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function invalidRelation(): never {
  // Do not echo submitted IDs or populated private documents in errors.
  throw new APIError('صيغة العلاقة التحريرية غير صالحة. / Invalid editorial relationship format.', 400);
}

/** Scalar and populated IDs share an identity; numeric route IDs may arrive as strings. */
export function canonicalRelationshipID(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const id: unknown = record(value) ? value.id : value;
  if (typeof id === 'string' && id.trim().length > 0) return id;
  if (typeof id === 'number' && Number.isSafeInteger(id)) return String(id);
  return invalidRelation();
}

/** Order and duplicates are retained: author credit order is editorial content. */
export function canonicalRelationshipIDs(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return invalidRelation();
  if (value.length > MAX_ARTICLE_AUTHORS) {
    throw new APIError('الحد الأقصى هو 20 مؤلفًا للمقال. / An article may reference at most 20 authors.', 400);
  }
  const ids: string[] = [];
  for (const item of value) {
    const id = canonicalRelationshipID(item);
    if (id === null) return invalidRelation();
    ids.push(id);
  }
  return ids;
}

/** Compare trusted, unredacted pair inputs before projecting public article fields.
 * Both legacy documents may omit associations. One-sided assignments never match.
 * Malformed associations throw instead of silently granting public eligibility.
 */
export function sameEditorialRelations(left: EditorialRelations, right: EditorialRelations): boolean {
  const leftCategory = canonicalRelationshipID(left.categoryRef);
  const rightCategory = canonicalRelationshipID(right.categoryRef);
  const leftAuthors = canonicalRelationshipIDs(left.authors);
  const rightAuthors = canonicalRelationshipIDs(right.authors);
  return leftCategory === rightCategory && leftAuthors.length === rightAuthors.length
    && leftAuthors.every((id, index) => id === rightAuthors[index]);
}

/** Install on Articles.beforeValidate. Keep default Payload relationship validation
 * for author existence/access, and set authors.hasMany=true, maxRows=MAX_ARTICLE_AUTHORS.
 * Both relationship fields also require staff-only field read access at integration.
 */
export const validateEditorialRelations: CollectionBeforeValidateHook<EditorialArticleDocument> = async ({ data, originalDoc, req }) => {
  if (!data) return data;
  if (data.authors !== undefined) canonicalRelationshipIDs(data.authors);

  const categoryProvided = data.categoryRef !== undefined;
  const sectionChanged = data.section !== undefined && data.section !== originalDoc?.section;
  if (!categoryProvided && !sectionChanged) return data;

  const categoryRef: unknown = categoryProvided ? data.categoryRef : originalDoc?.categoryRef;
  const id = canonicalRelationshipID(categoryRef);
  if (id === null) return data;
  const section: unknown = data.section !== undefined ? data.section : originalDoc?.section;
  // Never trust a submitted populated category's section. Keep this lookup in the
  // caller's transaction and enforce category collection access for the actual user.
  const category: unknown = await req.payload.findByID({
    collection: 'categories', id, overrideAccess: false, user: req.user, req,
    depth: 0, select: { section: true },
  });
  if (!record(category) || typeof section !== 'string' || !section || category.section !== section) {
    throw new APIError('يجب أن ينتمي التصنيف إلى قسم المقال. / The category must belong to the article’s section.', 400);
  }
  return data;
};