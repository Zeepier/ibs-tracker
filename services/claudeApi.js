import { Platform } from 'react-native';

const isLocalhost = Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.location.hostname === 'localhost';

const CLAUDE_API_URL = Platform.OS !== 'web'
  ? 'https://api.anthropic.com/v1/messages'
  : isLocalhost
    ? 'http://localhost:3001/claude'
    : '/claude';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

const getHeaders = () => {
  const headers = { 'content-type': 'application/json' };
  if (Platform.OS !== 'web') {
    headers['x-api-key'] = API_KEY;
    headers['anthropic-version'] = '2023-06-01';
  }
  return headers;
};

const KNOWLEDGE_BASE = `
=== FODMAP (source: Monash University FODMAP Database) ===
HIGH FODMAP: garlic, onion, leek, shallots, spring onion (white part), artichoke, asparagus, cauliflower, mushrooms, green peas, beetroot; apples, pears, watermelon, mango, cherries, peaches, nectarines, plums, dried fruits; cow's milk, yogurt, ice cream, custard, soft cheeses (ricotta, cottage); wheat, rye, barley (breads, pasta, cereals, biscuits); most legumes (kidney beans, chickpeas, lentils, baked beans); cashews, pistachios; honey, high-fructose corn syrup (HFCS), agave syrup, sorbitol, xylitol, mannitol (sugar-free products).
MEDIUM FODMAP: sweet potato (large portions), butternut squash (large), oats (large portions), some stone fruits in large amounts, basmati rice in large amounts.
LOW FODMAP: rice, potato, carrot, cucumber, courgette/zucchini, bell peppers, aubergine/eggplant, lettuce, bok choy, green beans, tomato (small amounts), spinach (small amounts); strawberries, blueberries, kiwi, orange, mandarin, pineapple, cantaloupe, grapes, banana (unripe); hard aged cheese (cheddar, parmesan, brie, camembert, feta), lactose-free dairy, almond milk; eggs, plain fresh meat/fish/tofu/tempeh; quinoa, oats (small portions), gluten-free grains; macadamias, peanuts, walnuts (small amounts); maple syrup, table sugar, dark chocolate (small amounts).

=== HISTAMINE (source: SIGHI food compatibility list, Swiss Interest Group Histamine Intolerance) ===
HIGH HISTAMINE (avoid): all aged/hard cheeses (parmesan, cheddar, gouda, blue cheese, camembert); all processed/cured/smoked meats (salami, ham, bacon, pepperoni, hot dogs); canned and smoked fish (tuna, sardines, mackerel, anchovies, herring, smoked salmon); all fermented foods (sauerkraut, kimchi, miso, soy sauce, fish sauce, kefir, kombucha); all alcohol; vinegar and pickled foods; tomatoes and all tomato products (paste, sauce, ketchup); spinach; aubergine/eggplant; avocado; overripe or dried fruits; strawberries; all citrus fruits (lemon, lime, orange, grapefruit); banana; pineapple; papaya; kiwi; walnuts; peanuts; chocolate and cocoa; food additives (sulphites E220-228, benzoates E210-219, glutamate E621); reheated leftovers (histamine increases with storage).
MEDIUM HISTAMINE: fresh tomatoes in small quantities; wheat, rye, barley; beans, lentils, soy, tofu; almonds; raspberries; wheatgerm.
LOW HISTAMINE: freshly cooked meat (eaten immediately); freshly caught/frozen fish cooked immediately; eggs; most fresh vegetables not listed above; apples, peaches, melons, grapes, mango (fresh, not overripe); rice, corn, potato; most cooking oils; fresh young cheeses (mozzarella, ricotta, cream cheese, mascarpone, young gouda); fresh herbs except chilli.

=== FRUCTOSE (source: University of Virginia GI Nutrition, PMC dietary fructose guidelines) ===
HIGH FRUCTOSE: apples, pears, watermelon, mango, grapes, cherries, raisins, dates, figs, all dried fruits; honey, agave syrup, HFCS, fruit juices, soft drinks with HFCS; asparagus, artichokes (large amounts).
MEDIUM FRUCTOSE: ripe bananas, blueberries, peaches, plums, oranges (limit portions).
LOW FRUCTOSE: most vegetables, rice, pasta, bread; berries (small amounts); citrus in small amounts; table sugar (sucrose — equal fructose/glucose ratio, generally tolerated better than excess free fructose); glucose-sweetened products.

=== LACTOSE (source: clinical IBS dietary guidelines) ===
HIGH LACTOSE: regular cow's milk, condensed/evaporated milk, ice cream, cream, ricotta, cottage cheese, soft fresh cheeses in large amounts.
MEDIUM LACTOSE: yogurt (partially fermented), sour cream, crème fraîche, some soft cheeses.
LOW LACTOSE: butter (trace only), brie, camembert (ripening reduces lactose).
NO LACTOSE: hard aged cheeses (parmesan, cheddar, gouda, swiss), lactose-free dairy products, all plant-based milks, eggs, meat, fish.

=== FAT (source: Monash IBS fat research, AGA Clinical Practice Update 2022) ===
HIGH FAT: deep-fried foods (chips, fried chicken, spring rolls); fatty processed meats (sausages, salami, bacon, burgers); full-fat cream, cream-based sauces, butter in large amounts; pastries, cakes, croissants, biscuits; pizza; fast food; avocado (large amounts); full-fat coconut milk.
MEDIUM FAT: eggs, nuts and seeds, olive oil in moderate cooking amounts, oily fish (salmon, mackerel), dark chocolate.
LOW FAT: lean meats, most vegetables and fruits, rice, pasta, bread, legumes, low-fat dairy.

=== GLUTEN (source: standard clinical coeliac/gluten sensitivity guidelines) ===
PRESENT: wheat, rye, barley, spelt, kamut, triticale; all standard bread, pasta, noodles, cereals, crackers, biscuits, cakes; beer; most soy sauces; many processed and packaged foods (check labels); seitan.
ABSENT: rice, corn/maize, potato, quinoa, millet, buckwheat, sorghum; certified gluten-free oats; fresh unprocessed meat, fish, eggs, dairy; fruits, vegetables, legumes; gluten-free labelled products.
`;

export async function getClarifyingQuestions(textDescription) {
  const prompt = `You are a clinical IBS dietitian. A patient has described what they ate: "${textDescription}"

Identify 1-3 clarifying questions that would meaningfully change the IBS risk analysis. Only ask if genuinely uncertain — do not ask obvious questions.

Good reasons to ask:
- Cooking method changes fat level (fried vs steamed)
- Ingredient variant changes FODMAP (sourdough vs regular bread, ripe vs unripe banana)
- Presence of common accompaniments not mentioned (soy sauce with sushi/stir fry, dressing on salad)
- Fresh vs aged/fermented changes histamine (fresh cheese vs aged cheese)
- Full-fat vs low-fat changes lactose/fat
- Garlic/onion as whole pieces vs infused oil (changes FODMAP)

If no meaningful uncertainty exists, return an empty array.

Respond with ONLY a JSON array, no extra text:
[{"question":"...","options":["option1","option2","option3"]}]

Maximum 3 questions. Each question must have 2-4 options. Include "Not sure" as a final option only if relevant.`;

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const text = data.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
}

export async function analyzeFoodWithClaude(textDescription) {
  const prompt = `You are a clinical IBS dietitian. Analyze this food using the reference knowledge below.

IMPORTANT: Base your ratings on the QUANTITY of each ingredient typically used in this dish, not just its presence. Consider these examples:
- Spice: a pinch of pepper = Mild; a dish defined by generous cracked pepper = Medium; very spicy chilli = Hot
- Fat: a sprinkle of cheese = Low; cheese as a sauce ingredient = Medium; a dish where cheese IS the sauce (e.g. cacio e pepe, mac and cheese, fondue) or uses cream as a base = High; deep-fried dishes = High
- Fiber: plain pasta or white rice alone = Low; dish with several vegetables or legumes = High
- Fructose: rate by the HIGHEST fructose ingredient present regardless of quantity — even a small amount of honey, agave, or HFCS is enough to trigger symptoms in sensitive individuals, so always rate High if these are present
Always consider the proportions typical to the specific recipe, not just ingredient presence.

REFERENCE KNOWLEDGE:
${KNOWLEDGE_BASE}

FOOD TO ANALYZE: "${textDescription || 'Unknown food'}"

Rules for each field:
- description: 1 sentence listing the main ingredients you identified
- fiber: MUST be exactly one of: Low, Medium, High
- fodmap: MUST be exactly one of: Low, Medium, High (use the FODMAP reference above)
- histamine: MUST be exactly one of: Low, Medium, High (use the histamine reference above)
- fructose: MUST be exactly one of: Low, Medium, High
- lactose: MUST be exactly one of: None, Low, Medium, High
- fat: MUST be exactly one of: Low, Medium, High
- spice: MUST be exactly one of: None, Mild, Medium, Hot
- caffeine: MUST be exactly one of: None, Low, Medium, High
- alcohol: MUST be exactly one of: None, Low, Medium, High
- artificialSweeteners: MUST be exactly one of: Present, Absent
- gluten: MUST be exactly one of: Present, Absent

Respond with ONLY this JSON, no extra text:
{"description":"...","fiber":"...","fodmap":"...","histamine":"...","fructose":"...","lactose":"...","fat":"...","spice":"...","caffeine":"...","alcohol":"...","artificialSweeteners":"...","gluten":"..."}`;

  try {
   const response = await fetch(CLAUDE_API_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  }),
});
if (!response.ok) throw new Error(`API error: ${response.status}`);
const data = await response.json();
const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Claude API Error:', error.message);
    throw new Error(`Food analysis failed: ${error.message}`);
  }
}
