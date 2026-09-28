import { APIError, type CollectionBeforeValidateHook } from 'payload';
import { canonicalRelationshipID } from './editorial-relations';

export const MAX_RELATED_ARTICLES = 20;
export const MAX_HIERARCHY_DEPTH = 4;
export const entityTypes = ['region', 'governorate', 'city', 'site', 'person', 'event', 'topic'] as const;
export const siteTypes = ['historical', 'religious', 'tourism', 'nature', 'museum'] as const;
export const bodyRoles = ['overview', 'administration', 'geography', 'history', 'antiquities', 'heritage', 'religious', 'culture', 'economy', 'nature', 'tourism', 'services'] as const;

type StructureDocument = { id: number | string; locale?: unknown; parent?: unknown; related?: unknown };

function relatedIDs(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new APIError('صيغة المقالات المرتبطة غير صالحة. / Invalid related articles format.', 400);
  if (value.length > MAX_RELATED_ARTICLES) throw new APIError(`الحد الأقصى ${MAX_RELATED_ARTICLES} مقالًا مرتبطًا. / At most ${MAX_RELATED_ARTICLES} related articles.`, 400);
  return value.map(item => canonicalRelationshipID(item) ?? '').filter(Boolean);
}

/** Parents and related articles stay in the same language; the hierarchy is acyclic and shallow. */
export const validateStructureRelations: CollectionBeforeValidateHook<StructureDocument> = async ({ data, originalDoc, req }) => {
  if (!data) return data;
  const locale = data.locale ?? originalDoc?.locale;
  const self = originalDoc?.id != null ? String(originalDoc.id) : undefined;
  const read = (id: string) => req.payload.findByID({
    collection: 'articles', id, depth: 0, overrideAccess: false, user: req.user, req, select: { locale: true, parent: true },
  }) as Promise<{ locale?: unknown; parent?: unknown }>;

  if (data.parent !== undefined) {
    let current = canonicalRelationshipID(data.parent);
    const seen = new Set(self ? [self] : []);
    for (let depth = 0; current !== null; depth += 1) {
      if (seen.has(current)) throw new APIError('لا يمكن أن يتبع المقال نفسه أو أحد فروعه. / The hierarchy cannot contain a cycle.', 400);
      if (depth >= MAX_HIERARCHY_DEPTH) throw new APIError(`التسلسل أعمق من ${MAX_HIERARCHY_DEPTH} مستويات. / Hierarchy deeper than ${MAX_HIERARCHY_DEPTH} levels.`, 400);
      seen.add(current);
      const doc = await read(current);
      if (depth === 0 && doc.locale !== locale) throw new APIError('يجب أن يكون المقال الأب بلغة المقال نفسها. / The parent must be in the same language.', 400);
      current = canonicalRelationshipID(doc.parent);
    }
  }

  if (data.related !== undefined) {
    const ids = relatedIDs(data.related);
    if (self && ids.includes(self)) throw new APIError('لا يمكن ربط المقال بنفسه. / An article cannot be related to itself.', 400);
    if (new Set(ids).size !== ids.length) throw new APIError('المقالات المرتبطة مكررة. / Duplicate related articles.', 400);
    for (const id of ids) {
      if ((await read(id)).locale !== locale) throw new APIError('يجب أن تكون المقالات المرتبطة بلغة المقال نفسها. / Related articles must be in the same language.', 400);
    }
  }
  return data;
};
