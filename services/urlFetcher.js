import { Platform } from 'react-native';

const isLocalhost = Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.location.hostname === 'localhost';

const WEB_PROXY = isLocalhost
  ? 'http://localhost:3001/fetch?url='
  : '/.netlify/functions/fetch?url=';

export function isUrl(text) {
  return /^https?:\/\//i.test(text.trim());
}

export async function fetchRecipeText(url) {
  const fetchUrl = Platform.OS === 'web'
    ? WEB_PROXY + encodeURIComponent(url)
    : url;

  const headers = Platform.OS !== 'web'
    ? { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' }
    : {};

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10000);
  const response = await fetch(fetchUrl, { headers, signal: controller.signal });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const html = await response.text();

  // 1. Try JSON-LD recipe schema (most reliable)
  const jsonLdMatches = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const block of jsonLdMatches) {
      try {
        const json = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, ''));
        const recipe = findRecipe(json);
        if (recipe) return formatRecipe(recipe);
      } catch {
        // continue
      }
    }
  }

  // 2. Strip boilerplate sections before extracting text
  const cleaned = html
    .replace(/<(nav|header|footer|aside|form|button|dialog|cookie)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // 3. Try to find the main content area
  const mainMatch =
    cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    cleaned.match(/<div[^>]*(?:recipe|ingredients|content)[^>]*>([\s\S]*?)<\/div>/i);

  const body = mainMatch ? mainMatch[1] : cleaned;

  // 4. Look for an ingredients section specifically
  const ingredientsMatch = body.match(/ingredients[\s\S]{0,3000}/i);
  if (ingredientsMatch) {
    const text = ingredientsMatch[0]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 100) return text.slice(0, 2000);
  }

  // 5. Fall back to full body text
  const text = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 100) {
    throw new Error('Could not extract recipe content from this page. Try pasting the ingredients directly.');
  }

  return text.slice(0, 2000);
}

function findRecipe(json) {
  if (!json) return null;
  if (Array.isArray(json)) {
    for (const item of json) {
      const found = findRecipe(item);
      if (found) return found;
    }
  }
  if (json['@type'] === 'Recipe') return json;
  if (json['@graph']) return findRecipe(json['@graph']);
  return null;
}

function formatRecipe(recipe) {
  const parts = [];
  if (recipe.name) parts.push(`Recipe: ${recipe.name}`);
  if (recipe.recipeIngredient) {
    parts.push('Ingredients: ' + recipe.recipeIngredient.join(', '));
  }
  if (recipe.description) parts.push(`Description: ${recipe.description}`);
  return parts.join('\n');
}
