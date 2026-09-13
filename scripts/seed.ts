/**
 * Seeds `categories` and `places` with sample data so M1's search/browse UI has
 * something real to query against.
 *
 * The places below are SYNTHETIC demo data — plausible small-business names and
 * approximate town-center coordinates for localities in and around Habra, North 24
 * Parganas (per 02-brand-and-positioning.md §9's "start extremely narrow" strategy)
 * — not a scrape or listing of real, identifiable businesses. Swap this file for
 * real community submissions once M2's add-place flow ships.
 *
 * Usage: npm run seed  (wipes and re-seeds `categories` and `places` only)
 */
import { loadEnv } from "./_env";
loadEnv();

import { MongoClient, ObjectId } from "mongodb";
import { placeInputSchema } from "../src/lib/validation/place";

// ---------------------------------------------------------------------------
// Categories — mirrors the taxonomy sketched in 01-product-vision.md.
// ---------------------------------------------------------------------------

interface CategorySeed {
  slug: string;
  name: string;
  icon: string;
  synonyms: string[];
  parentSlug?: string;
}

const CATEGORIES: CategorySeed[] = [
  { slug: "electronics", name: "Electronics", icon: "cpu", synonyms: ["electronics"] },
  {
    slug: "mobile-repair",
    name: "Mobile Repair",
    icon: "smartphone",
    synonyms: ["mobile repair", "phone repair", "cell repair", "fix my phone"],
    parentSlug: "electronics",
  },
  {
    slug: "computer-shop",
    name: "Computer Shop",
    icon: "monitor",
    synonyms: ["computer shop", "laptop shop", "pc shop"],
    parentSlug: "electronics",
  },
  {
    slug: "cctv",
    name: "CCTV & Security",
    icon: "camera",
    synonyms: ["cctv", "security camera", "camera installation"],
    parentSlug: "electronics",
  },

  { slug: "food", name: "Food", icon: "utensils", synonyms: ["food"] },
  {
    slug: "restaurant",
    name: "Restaurant",
    icon: "utensils-crossed",
    synonyms: ["restaurant", "hotel", "dining", "eatery"],
    parentSlug: "food",
  },
  {
    slug: "sweet-shop",
    name: "Sweet Shop",
    icon: "cake",
    synonyms: ["sweet shop", "mishti", "sweets"],
    parentSlug: "food",
  },
  {
    slug: "bakery",
    name: "Bakery",
    icon: "croissant",
    synonyms: ["bakery", "cake shop", "bread"],
    parentSlug: "food",
  },

  { slug: "services", name: "Services", icon: "wrench", synonyms: ["services"] },
  {
    slug: "electrician",
    name: "Electrician",
    icon: "zap",
    synonyms: ["electrician", "wiring", "fix my light"],
    parentSlug: "services",
  },
  {
    slug: "plumber",
    name: "Plumber",
    icon: "droplet",
    synonyms: ["plumber", "plumbing", "fix my tap", "pipe repair"],
    parentSlug: "services",
  },
  {
    slug: "photographer",
    name: "Photographer",
    icon: "camera",
    synonyms: ["photographer", "photo studio", "videography"],
    parentSlug: "services",
  },
  {
    slug: "tailor",
    name: "Tailor",
    icon: "scissors",
    synonyms: ["tailor", "boutique", "stitching"],
    parentSlug: "services",
  },
  {
    slug: "salon",
    name: "Salon",
    icon: "scissors",
    synonyms: ["salon", "parlour", "barber", "haircut"],
    parentSlug: "services",
  },

  { slug: "education", name: "Education", icon: "graduation-cap", synonyms: ["education"] },
  {
    slug: "coaching",
    name: "Coaching Centre",
    icon: "book-open",
    synonyms: ["coaching", "tuition", "tutorial"],
    parentSlug: "education",
  },
  {
    slug: "computer-training",
    name: "Computer Training",
    icon: "laptop",
    synonyms: ["computer training", "computer course", "computer institute"],
    parentSlug: "education",
  },

  { slug: "retail", name: "Retail", icon: "store", synonyms: ["retail", "shop"] },
  {
    slug: "clothing",
    name: "Clothing",
    icon: "shirt",
    synonyms: ["clothing", "garments", "fashion", "clothes shop"],
    parentSlug: "retail",
  },
  {
    slug: "grocery",
    name: "Grocery",
    icon: "shopping-basket",
    synonyms: ["grocery", "kirana", "general store"],
    parentSlug: "retail",
  },
  {
    slug: "hardware",
    name: "Hardware Store",
    icon: "hammer",
    synonyms: ["hardware", "hardware store", "paint shop"],
    parentSlug: "retail",
  },
  {
    slug: "stationery",
    name: "Stationery",
    icon: "pencil",
    synonyms: ["stationery", "books", "xerox", "printing"],
    parentSlug: "retail",
  },
  {
    slug: "medical-store",
    name: "Medical Store",
    icon: "pill",
    synonyms: ["medical store", "pharmacy", "chemist", "medicine shop"],
    parentSlug: "retail",
  },
  {
    slug: "cycle-store",
    name: "Cycle Store",
    icon: "bike",
    synonyms: ["cycle store", "bicycle shop", "cycle repair"],
    parentSlug: "retail",
  },
];

// ---------------------------------------------------------------------------
// Localities — approximate town-center coordinates, North 24 Parganas.
// ---------------------------------------------------------------------------

interface LocalitySeed {
  locality: string;
  district: string;
  pincode: string;
  lat: number;
  lng: number;
}

const LOCALITIES: LocalitySeed[] = [
  { locality: "Habra", district: "North 24 Parganas", pincode: "743263", lat: 22.8433, lng: 88.6961 },
  { locality: "Ashoknagar", district: "North 24 Parganas", pincode: "743222", lat: 22.8459, lng: 88.6743 },
  { locality: "Barasat", district: "North 24 Parganas", pincode: "700124", lat: 22.7229, lng: 88.4809 },
  { locality: "Gaighata", district: "North 24 Parganas", pincode: "743249", lat: 23.0206, lng: 88.7658 },
  { locality: "Duttapukur", district: "North 24 Parganas", pincode: "743248", lat: 22.7167, lng: 88.6167 },
  { locality: "Chandpara", district: "North 24 Parganas", pincode: "743145", lat: 22.9333, lng: 88.7167 },
];

// ---------------------------------------------------------------------------
// Name generation — prefix + category noun, deterministic shuffle.
// ---------------------------------------------------------------------------

const NAME_PREFIXES = [
  "Maa", "Sri", "New", "Ganesh", "Durga", "Laxmi", "Radha", "Bengal", "City",
  "Metro", "Royal", "Central", "Modern", "Classic", "Sunrise", "Green", "Star",
  "National", "Sonar Bangla", "Purbasha",
];

const CATEGORY_NOUNS: Record<string, string[]> = {
  "mobile-repair": ["Mobile Care", "Mobile Point", "Mobile Zone"],
  "computer-shop": ["Computers", "Computer Point", "InfoTech"],
  cctv: ["Security Systems", "CCTV Solutions"],
  restaurant: ["Restaurant", "Hotel", "Dining"],
  "sweet-shop": ["Sweets", "Mistanna Bhandar"],
  bakery: ["Bakery", "Cake Corner"],
  electrician: ["Electricals", "Electric Works"],
  plumber: ["Plumbing Works", "Sanitary & Plumbing"],
  photographer: ["Photo Studio", "Digital Studio"],
  tailor: ["Tailors", "Boutique"],
  salon: ["Hair Salon", "Beauty Parlour"],
  coaching: ["Coaching Centre", "Tutorial Home"],
  "computer-training": ["Computer Academy", "Computer Institute"],
  clothing: ["Garments", "Fashion Point", "Cloth Store"],
  grocery: ["Grocery Store", "General Store", "Kirana Store"],
  hardware: ["Hardware Store", "Paints & Hardware"],
  stationery: ["Stationery", "Book Depot", "Xerox & Printing"],
  "medical-store": ["Medical Hall", "Pharmacy"],
  "cycle-store": ["Cycle Store", "Cycle Works"],
};

/** Small deterministic PRNG (mulberry32) so re-running seed gives the same data. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20240913);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** Jitter a locality's center point by up to ~1.5km so places aren't stacked. */
function jitter(value: number): number {
  return value + (rand() - 0.5) * 0.027;
}

const LEAF_CATEGORY_SLUGS = Object.keys(CATEGORY_NOUNS);

function generatePlaces(count: number) {
  const seen = new Set<string>();
  const places: Array<ReturnType<typeof buildOne>> = [];

  function buildOne() {
    const categorySlug = pick(LEAF_CATEGORY_SLUGS);
    const loc = pick(LOCALITIES);
    const name = `${pick(NAME_PREFIXES)} ${pick(CATEGORY_NOUNS[categorySlug])}`;
    return {
      name,
      categorySlug,
      district: loc.district,
      locality: loc.locality,
      pincode: loc.pincode,
      lat: jitter(loc.lat),
      lng: jitter(loc.lng),
      phone: `9${Math.floor(100000000 + rand() * 899999999)}`,
      description: `Community-added ${CATEGORY_NOUNS[categorySlug][0].toLowerCase()} in ${loc.locality}.`,
    };
  }

  while (places.length < count) {
    const candidate = buildOne();
    const dedupeKey = `${candidate.name}|${candidate.locality}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    places.push(candidate);
  }
  return places;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME ?? "aaspaas_dev";
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local first.");
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log(`Seeding ${dbName}...`);

  await db.collection("categories").deleteMany({});
  await db.collection("places").deleteMany({});

  const slugToId = new Map<string, ObjectId>();
  for (const cat of CATEGORIES) slugToId.set(cat.slug, new ObjectId());

  const categoryDocs = CATEGORIES.map((cat) => ({
    _id: slugToId.get(cat.slug)!,
    slug: cat.slug,
    name: cat.name,
    parentCategoryId: cat.parentSlug ? (slugToId.get(cat.parentSlug) ?? null) : null,
    icon: cat.icon,
    synonyms: cat.synonyms,
  }));
  await db.collection("categories").insertMany(categoryDocs);
  console.log(`  inserted ${categoryDocs.length} categories`);

  const rawPlaces = generatePlaces(80);
  const now = new Date();

  const placeDocs = rawPlaces.map((p, i) => {
    const parsed = placeInputSchema.parse({
      name: p.name,
      categorySlug: p.categorySlug,
      description: p.description,
      phone: p.phone,
      district: p.district,
      locality: p.locality,
      pincode: p.pincode,
      lat: p.lat,
      lng: p.lng,
    });
    const categoryId = slugToId.get(parsed.categorySlug);
    if (!categoryId) throw new Error(`Unknown category slug: ${parsed.categorySlug}`);

    const slug = `${parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${i}`;
    const createdAt = new Date(now.getTime() - Math.floor(rand() * 1000 * 60 * 60 * 24 * 180));

    return {
      _id: new ObjectId(),
      name: parsed.name,
      slug,
      categoryId,
      description: parsed.description,
      phone: parsed.phone,
      district: parsed.district,
      locality: parsed.locality,
      pincode: parsed.pincode,
      location: { type: "Point" as const, coordinates: [parsed.lng, parsed.lat] as [number, number] },
      address: undefined,
      createdBy: null,
      ownerId: null,
      status: "published" as const,
      spamScore: 0,
      verificationCount: Math.floor(rand() * 5),
      usefulCount: Math.floor(rand() * 40),
      notUsefulCount: Math.floor(rand() * 4),
      duplicateOfPlaceId: null,
      tier: "free" as const,
      createdAt,
      updatedAt: createdAt,
    };
  });

  await db.collection("places").insertMany(placeDocs);
  console.log(`  inserted ${placeDocs.length} places across ${LOCALITIES.length} localities`);

  await client.close();
  console.log("Done. Run `npm run create-indexes` if you haven't already.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
