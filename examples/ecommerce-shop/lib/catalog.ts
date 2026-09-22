export type Product = {
  id: string; name: string; category: string; price: number;
  origin: string; notes: string; desc: string; badge?: string;
}

export const PRODUCTS: Product[] = [
  { id: "masala-chai", name: "Masala Chai", category: "chai", price: 249, origin: "Assam", notes: "cardamom, ginger, clove", desc: "Assam CTC with whole spices ground fresh weekly. The morning classic -- strong, sweet, unmistakable.", badge: "bestseller" },
  { id: "assam-gold", name: "Assam Gold", category: "chai", price: 429, origin: "Assam", notes: "malty, bright", desc: "Second-flush orthodox leaves from a single garden. Malty body, no milk needed." },
  { id: "green-elaichi", name: "Green Elaichi", category: "green", price: 349, origin: "Darjeeling", notes: "floral, clean", desc: "Pan-fired green with whole green cardamom. Clean finish, afternoon-friendly." },
  { id: "tulsi-clarity", name: "Tulsi Clarity", category: "green", price: 299, origin: "Uttarakhand", notes: "herbal, citrus", desc: "Rama tulsi and lemongrass, caffeine-light. The desk-drink for long afternoons." },
  { id: "kashmiri-noon", name: "Kashmiri Noon", category: "blends", price: 519, origin: "Kashmir", notes: "saffron, almond, cinnamon", desc: "The pink tea of the valley -- saffron, crushed almonds, a whisper of cinnamon.", badge: "limited" },
  { id: "monsoon-flush", name: "Monsoon First Flush", category: "chai", price: 479, origin: "Darjeeling", notes: "wet earth, delicate", desc: "June pluck, high grown. Delicate with a wet-earth finish that monsoon people miss all year.", badge: "new" },
  { id: "earl-grey-india", name: "Earl Grey India", category: "blends", price: 389, origin: "Nilgiris", notes: "bergamot, citrus", desc: "Nilgiri black with natural bergamot oil. The afternoon wedge between lunch and evening." },
  { id: "oolok-cloud", name: "Oolong Cloud", category: "green", price: 599, origin: "Darjeeling", notes: "orchid, cream", desc: "Tightly rolled, slow-steeping oolong that opens across three pours." },
  { id: "cutting-strong", name: "Cutting Strong", category: "chai", price: 199, origin: "Assam", notes: "dust grade, bold", desc: "The honest tapri cup -- bold dust grade that cuts through milk and sugar." },
  { id: "white-moonlight", name: "White Moonlight", category: "blends", price: 749, origin: "Darjeeling", notes: "honey, hay", desc: "Plucked before dawn, dried without rolling. Honey and hay, almost no astringency." },
  { id: "masala-winter", name: "Winter Masala", category: "blends", price: 329, origin: "Assam", notes: "cinnamon, black pepper", desc: "Heavier spice cut for December -- extra cinnamon and black pepper, longer simmer." },
  { id: "iced-summer", name: "Iced Summer", category: "green", price: 279, origin: "Nilgiris", notes: "mint, cold-brew", desc: "Cold-brew cut green with mint. Twelve hours in the fridge, zero bitterness." },
]

export const CATEGORIES = [
  { id: "chai", name: "Chai", desc: "Black, milky, strong -- the everyday section" },
  { id: "green", name: "Green", desc: "Pan-fired, floral, light on caffeine" },
  { id: "blends", name: "Blends", desc: "Saffron, bergamot, spice experiments" },
]

export function findProduct(id: string) {
  return PRODUCTS.find((p) => p.id === id) ?? null
}
