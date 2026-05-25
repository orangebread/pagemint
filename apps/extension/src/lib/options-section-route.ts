export const optionsSectionIds = [
  'defaults',
  'permissions',
  'history'
] as const;

export type OptionsSectionId = typeof optionsSectionIds[number];

export const defaultOptionsSection: OptionsSectionId = 'defaults';

export function parseOptionsSectionFromHash(hash: string | undefined): OptionsSectionId {
  if (!hash) return defaultOptionsSection;
  const candidate = hash.startsWith('#') ? hash.slice(1) : hash;
  return (optionsSectionIds as readonly string[]).includes(candidate)
    ? (candidate as OptionsSectionId)
    : defaultOptionsSection;
}

export function serializeOptionsSectionToHash(section: OptionsSectionId): string {
  return `#${section}`;
}
