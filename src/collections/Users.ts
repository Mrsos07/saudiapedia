import { APIError, type CollectionConfig, type CollectionBeforeChangeHook } from 'payload';
import { hasRole, isAdmin, roles } from './access';

// The built-in first-user operation bypasses create access, but still runs this hook.
// A unique singleton prevents two simultaneous first-user requests creating two admins.
export const protectUser: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation === 'create') {
    const existing = await req.payload.db.findOne({ collection: 'users', req, where: {} });
    if (!existing) {
      data.role = 'administrator';
      data.bootstrapKey = 'first-administrator';
      return data;
    }
  }
  if (!hasRole(req, ['administrator'])) {
    throw new APIError('Only an administrator can create or change users.', 403);
  }
  if (operation === 'create') data.bootstrapKey = null;
  else delete data.bootstrapKey;
  if (data.role !== undefined && !roles.includes(data.role)) {
    throw new APIError('Invalid user role.', 400);
  }
  return data;
};

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: { ar: 'مستخدم', en: 'User' }, plural: { ar: 'المستخدمون', en: 'Users' } },
  admin: {
    group: { ar: 'الإدارة', en: 'Administration' },
    useAsTitle: 'email', defaultColumns: ['email', 'name', 'role'],
    description: { ar: 'حسابات دخول فريق التحرير وصلاحياتهم. يتولى المسؤول إنشاء الحسابات وتعديلها؛ ملفات المؤلفين منفصلة عن حسابات الدخول.', en: 'Editorial team login accounts and permissions. Administrators create and edit accounts; author profiles are separate from login accounts.' },
  },
  auth: {
    tokenExpiration: 7200,
    // After 3 failed attempts, the account is locked for a full hour (3,600,000 ms).
    maxLoginAttempts: 3,
    lockTime: 3600000,
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
  },
  access: {
    admin: ({ req }) => hasRole(req, roles),
    create: isAdmin,
    read: ({ req }) => hasRole(req, ['administrator']) || (req.user?.collection === 'users'
      ? { id: { equals: req.user.id } }
      : false),
    update: isAdmin,
    // Explicit mitigation for Payload's permissive default account-unlock access.
    unlock: isAdmin,
    // Deactivate/change accounts through an administrator; no accidental bootstrap reopening.
    delete: () => false,
  },
  hooks: { beforeChange: [protectUser] },
  fields: [
    { name: 'name', type: 'text', label: { ar: 'الاسم', en: 'Name' } },
    {
      name: 'role', type: 'select', required: true, defaultValue: 'editor',
      label: { ar: 'الدور', en: 'Role' },
      admin: { description: { ar: 'administrator: مسؤول؛ editor: محرر؛ translator: مترجم؛ reviewer: مراجع. تغيير الدور متاح للمسؤول فقط.', en: 'administrator: administrator; editor: editor; translator: translator; reviewer: reviewer. Only administrators can change roles.' } },
      options: roles.map((value) => ({ value, label: {
        administrator: { ar: 'مسؤول', en: 'Administrator' },
        editor: { ar: 'محرر', en: 'Editor' },
        translator: { ar: 'مترجم', en: 'Translator' },
        reviewer: { ar: 'مراجع', en: 'Reviewer' },
      }[value] })),
      access: { create: ({ req }) => hasRole(req, ['administrator']), update: ({ req }) => hasRole(req, ['administrator']) },
    },
    {
      name: 'bootstrapKey', type: 'text', unique: true, hidden: true,
      access: { create: () => false, update: () => false, read: () => false },
    },
  ],
};