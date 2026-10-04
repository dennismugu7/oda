// The staging demo shop "Demo Duka" (milestones M4, owner Step 63): obviously fake, safe
// data. No real people, no real M-Pesa account (buyers would pay on delivery), a test-only
// WhatsApp number, and an owner account without a password (nobody can sign in as it).

export const DEMO_OWNER = {
  email: 'demo-duka@example.invalid',
  name: 'Demo Seller',
};

export const DEMO_SHOP = {
  name: 'Demo Duka',
  slug: 'demo-duka',
  // Test-only number (+254 700 000 000), not a real seller.
  whatsappPhone: '+254700000000',
  about: 'A demo shop for testing oda. Nothing here is for sale and orders are not real.',
  locationLabel: 'Demo town',
};

export const DEMO_CATEGORIES = ['Dresses', 'Tops', 'Shoes', 'Bags', 'Accessories'] as const;
type CategoryName = (typeof DEMO_CATEGORIES)[number];

export interface DemoProduct {
  name: string;
  category: CategoryName;
  price: number;
  compareAtPrice?: number;
  status?: 'available' | 'sold_out';
  sizes?: string[];
  colours?: { name: string; hex?: string }[];
  unitsSold?: number;
  /** Placeholder image: background colour and a simple shape. */
  colour: string;
  shape: 'dress' | 'top' | 'shoe' | 'bag' | 'ring';
  /** Days ago it was "added" (for the New badge and newest-first order). */
  ageDays: number;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    name: 'Demo wrap dress',
    category: 'Dresses',
    price: 2500,
    compareAtPrice: 3200,
    sizes: ['S', 'M', 'L', 'XL'],
    colours: [
      { name: 'Maroon', hex: '#800020' },
      { name: 'Navy', hex: '#1F2A44' },
    ],
    unitsSold: 12,
    colour: '#F4D8CF',
    shape: 'dress',
    ageDays: 40,
  },
  {
    name: 'Demo maxi dress',
    category: 'Dresses',
    price: 1800,
    sizes: ['M', 'L'],
    unitsSold: 6,
    colour: '#DDEBE3',
    shape: 'dress',
    ageDays: 30,
  },
  {
    name: 'Demo shift dress',
    category: 'Dresses',
    price: 2200,
    sizes: ['S', 'M'],
    colour: '#E6E3F1',
    shape: 'dress',
    ageDays: 3,
  },
  {
    name: 'Demo linen top',
    category: 'Tops',
    price: 1200,
    sizes: ['S', 'M', 'L'],
    unitsSold: 4,
    colour: '#F3E9D2',
    shape: 'top',
    ageDays: 25,
  },
  {
    name: 'Demo printed tee',
    category: 'Tops',
    price: 900,
    colours: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Black', hex: '#111111' },
    ],
    colour: '#E3ECF6',
    shape: 'top',
    ageDays: 5,
  },
  {
    name: 'Demo blouse',
    category: 'Tops',
    price: 1500,
    status: 'sold_out',
    sizes: ['M'],
    unitsSold: 3,
    colour: '#F7E1E8',
    shape: 'top',
    ageDays: 50,
  },
  {
    name: 'Demo leather sandals',
    category: 'Shoes',
    price: 1800,
    sizes: ['38', '39', '40', '41', '42'],
    unitsSold: 8,
    colour: '#EFE3D6',
    shape: 'shoe',
    ageDays: 35,
  },
  {
    name: 'Demo canvas sneakers',
    category: 'Shoes',
    price: 2800,
    compareAtPrice: 3500,
    sizes: ['39', '40', '41', '42', '43'],
    colour: '#E2EEE9',
    shape: 'shoe',
    ageDays: 2,
  },
  {
    name: 'Demo woven tote',
    category: 'Bags',
    price: 1800,
    unitsSold: 2,
    colour: '#F1E7C9',
    shape: 'bag',
    ageDays: 20,
  },
  {
    name: 'Demo crossbody bag',
    category: 'Bags',
    price: 2400,
    colours: [
      { name: 'Brown', hex: '#795548' },
      { name: 'Beige', hex: '#D9C3A0' },
    ],
    colour: '#EADCD2',
    shape: 'bag',
    ageDays: 45,
  },
  {
    name: 'Demo beaded earrings',
    category: 'Accessories',
    price: 600,
    colour: '#F6E0D9',
    shape: 'ring',
    ageDays: 1,
  },
  {
    name: 'Demo bangle set',
    category: 'Accessories',
    price: 800,
    colours: [{ name: 'Gold', hex: '#C9A227' }],
    colour: '#F2EBD9',
    shape: 'ring',
    ageDays: 60,
  },
];
