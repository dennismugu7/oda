// The shop profile's location picker (spec §5.6: Kenyan town / Nairobi area picker + free
// text). Stored as plain text in shops.location_label, e.g. "Kilimani, Nairobi"; a seller
// can also type anything else.

export const NAIROBI_AREAS = [
  'CBD',
  'Kilimani',
  'Westlands',
  'Kileleshwa',
  'Lavington',
  'Parklands',
  'South B',
  'South C',
  'Langata',
  'Karen',
  'Ngong Road',
  'Kasarani',
  'Roysambu',
  'Zimmerman',
  'Githurai',
  'Kahawa',
  'Embakasi',
  'Donholm',
  'Buruburu',
  'Umoja',
  'Eastleigh',
  'Kawangware',
  'Kangemi',
  'Rongai',
  'Kitengela',
  'Ruaka',
  'Ruiru',
  'Syokimau',
] as const;

export const KENYAN_TOWNS = [
  'Mombasa',
  'Kisumu',
  'Nakuru',
  'Eldoret',
  'Thika',
  'Machakos',
  'Nyeri',
  'Meru',
  'Kericho',
  'Kakamega',
  'Kisii',
  'Naivasha',
  'Nanyuki',
  'Malindi',
  'Kitale',
  'Embu',
  'Bungoma',
  'Garissa',
  'Kilifi',
  'Narok',
] as const;

/** Every picker choice, Nairobi areas first ("Kilimani, Nairobi"), then towns. */
export const LOCATION_CHOICES: readonly string[] = [
  'Nairobi',
  ...NAIROBI_AREAS.map((area) => `${area}, Nairobi`),
  ...KENYAN_TOWNS,
];

/** Choices matching what the seller typed (case-insensitive, word starts first). */
export function searchLocations(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return LOCATION_CHOICES.slice(0, limit);
  const starts = LOCATION_CHOICES.filter((c) =>
    c
      .toLowerCase()
      .split(/[\s,]+/)
      .some((word) => word.startsWith(q)),
  );
  const contains = LOCATION_CHOICES.filter(
    (c) => !starts.includes(c) && c.toLowerCase().includes(q),
  );
  return [...starts, ...contains].slice(0, limit);
}
