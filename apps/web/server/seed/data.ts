// The "Amani Styles" demo shop (decisions #36 and the M1 plan): what the seller-app designs
// show, with the owner-approved deviations. Local development only (see run.ts).

export const SHOP = {
  name: 'Amani Styles',
  slug: 'amani-styles',
  about: 'Ankara and kitenge pieces made in Nairobi. Same-day delivery.',
  locationLabel: 'Kilimani, Nairobi',
  whatsappPhone: '+254712345678',
  callsEnabled: true,
  tiktokHandle: 'amani.styles',
  businessType: 'fashion' as const,
  channels: ['tiktok', 'whatsapp', 'instagram'],
  acceptsPayBefore: true,
  acceptsPayOnDelivery: true, // decision #36 (a)
  pickupEnabled: true,
  pickupLocation: 'Kilimani stall',
  pickupHours: 'Mon–Sat 9am–6pm',
  freeDeliveryThreshold: 5000,
};

export const SELLER = { name: 'Amani Wairimu', email: 'amani@example.test' };
export const ADMIN = { name: 'oda Admin', email: 'admin@example.test' };

export const TILL = { type: 'till' as const, number: '123456', accountName: 'AMANI STYLES' };

export const AREAS = {
  near: {
    name: 'Kilimani & Westlands',
    fee: 200,
    method: 'rider',
    etaLabel: 'Same day',
    free: true,
  },
  nairobi: { name: 'Rest of Nairobi', fee: 300, method: 'rider', etaLabel: 'Same day', free: true },
  outside: {
    name: 'Outside Nairobi',
    fee: 450,
    method: 'parcel',
    etaLabel: '1–2 days',
    free: false,
  },
} as const;
export type AreaKey = keyof typeof AREAS;

export const CATEGORIES = ['Dresses', 'Tops', 'Shoes', 'Bags', 'Accessories'] as const;
export type CategoryName = (typeof CATEGORIES)[number];

const SHOE_SIZES = ['38', '39', '40', '41', '42'];

/** The 13 products, newest first (the Shop tab's default order). */
export const PRODUCTS = {
  ankara: {
    category: 'Dresses',
    name: 'Ankara wrap dress',
    price: 2500,
    compareAtPrice: 3200,
    sizes: ['M', 'L', 'XL'],
  },
  kitengeTop: { category: 'Tops', name: 'Kitenge top', price: 1200, sizes: ['S', 'M', 'L'] },
  sandals: { category: 'Shoes', name: 'Leather sandals', price: 1800, sizes: SHOE_SIZES },
  linenShirt: { category: 'Tops', name: 'Linen shirt', price: 1500, sizes: ['M', 'L'] },
  maxiSkirt: { category: 'Tops', name: 'Maxi skirt', price: 1600, status: 'sold_out' },
  kiondo: { category: 'Bags', name: 'Kiondo bag', price: 1800 },
  earrings: { category: 'Accessories', name: 'Beaded earrings', price: 1100 },
  tote: { category: 'Bags', name: 'Leather tote', price: 2200 },
  maxiDress: { category: 'Dresses', name: 'Maxi dress', price: 1800, sizes: ['S', 'M', 'L', 'XL'] },
  shiftDress: {
    category: 'Dresses',
    name: 'Kitenge shift dress',
    price: 2200,
    sizes: ['S', 'M', 'L'],
  },
  sundress: {
    category: 'Dresses',
    name: 'Linen sundress',
    price: 1900,
    sizes: ['S', 'M', 'L'],
    status: 'sold_out',
  },
  loafers: { category: 'Shoes', name: 'Suede loafers', price: 2000, sizes: SHOE_SIZES },
  sneakers: {
    category: 'Shoes',
    name: 'Canvas sneakers',
    price: 1700,
    sizes: SHOE_SIZES,
    status: 'hidden',
  },
} satisfies Record<
  string,
  {
    category: CategoryName;
    name: string;
    price: number;
    compareAtPrice?: number;
    sizes?: string[];
    status?: 'available' | 'sold_out' | 'hidden';
  }
>;
export type ProductKey = keyof typeof PRODUCTS;

/**
 * Older stock, soft-deleted after the history orders are placed (decision #36 c): the 123
 * history deliveries count for ratings, deliveries and customers, not for today's sold counts.
 */
export const OLD_PRODUCTS = [
  { category: 'Dresses', name: 'Kitenge wrap skirt', price: 1700 },
  { category: 'Dresses', name: 'Batik midi dress', price: 2400 },
  { category: 'Tops', name: 'Ankara crop top', price: 1100 },
  { category: 'Tops', name: 'Batik kimono', price: 2600 },
  { category: 'Shoes', name: 'Leather slides', price: 1500 },
  { category: 'Bags', name: 'Sisal basket bag', price: 1400 },
  { category: 'Accessories', name: 'Ankara headwrap', price: 900 },
] as const satisfies readonly { category: CategoryName; name: string; price: number }[];

/** People in the designs, plus regular buyers for the history. Phones are fake (07xx 000 xxx). */
export const PEOPLE = {
  wanjiku: 'Wanjiku Mwangi',
  brian: 'Brian Otieno',
  achieng: 'Achieng Odhiambo',
  otieno: 'Otieno Kamau',
  njeri: 'Njeri Kamau',
  mercy: 'Mercy Wambui',
  kevin: 'Kevin Mutua',
  grace: 'Grace Njoroge',
  faith: 'Faith Atieno',
  joy: 'Joy Wanjiru',
  linet: 'Linet Chebet',
  peter: 'Peter Mwangi',
} as const;
export type PersonKey = keyof typeof PEOPLE;

export const REGULARS = [
  'Akinyi Ouma',
  'Amina Hassan',
  'Beatrice Muthoni',
  'Caroline Chepkoech',
  'Cynthia Nyambura',
  'Diana Wekesa',
  'Esther Kariuki',
  'Eunice Moraa',
  'Fatuma Ali',
  'Gladys Jeptoo',
  'Halima Abdi',
  'Irene Wangari',
  'Jackline Auma',
  'Josephine Ndinda',
  'Lucy Nyokabi',
  'Margaret Wairimu',
  'Mary Achieng',
  'Naomi Kerubo',
  'Nancy Mumbi',
  'Pauline Kemunto',
  'Purity Gathoni',
  'Rose Adhiambo',
  'Ruth Nekesa',
  'Salome Wanjiku',
  'Sarah Chelangat',
  'Susan Kanini',
  'Tabitha Muthoni',
  'Vivian Anyango',
  'Winnie Jerono',
  'Zawadi Mwende',
] as const;

export const REVIEW_TAGS = ['As described', 'Well packed', 'Fast delivery', 'Friendly seller'];

export const REVIEW_TEXTS = {
  5: [
    'Fits perfectly and the fabric is so soft.',
    'Lovely quality, will order again.',
    'Exactly like the photos. Asante!',
    'Delivered the same day, very happy.',
    'Beautiful colours, I got so many compliments.',
    'Great fit and well packed.',
  ],
  4: [
    'Nice piece, the colour is slightly darker than the photo.',
    'Good quality, delivery took a day longer.',
  ],
  3: ['Okay, but the size runs small.'],
  1: ['The parcel arrived two days late and the bag strap was loose.'],
} as const;

export const REPLIES = [
  'Asante sana! See you again soon.',
  'Thank you for shopping with us!',
  'So glad you love it!',
  "Sorry about that. Please WhatsApp us and we'll make it right.",
];
