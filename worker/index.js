// Cloudflare Worker - 菜谱搜索代理（无需API Key）
// 直接抓取下厨房搜索结果，解析返回结构化菜谱数据

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword');

    if (!keyword) {
      return jsonResponse({ error: '请提供keyword参数' });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    try {
      // 搜索下厨房
      const searchUrl = `https://www.xiachufang.com/search/?keyword=${encodeURIComponent(keyword)}`;
      const resp = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Accept': 'text/html'
        }
      });
      const html = await resp.text();

      // 解析搜索结果页面，提取菜谱链接
      const recipeLinks = [];
      const linkRegex = /\/recipe\/(\d+)\//g;
      let match;
      const seen = new Set();
      while ((match = linkRegex.exec(html)) !== null) {
        if (!seen.has(match[1])) {
          seen.add(match[1]);
          recipeLinks.push(match[1]);
        }
        if (recipeLinks.length >= 3) break; // 最多取3个
      }

      if (recipeLinks.length === 0) {
        return jsonResponse({ success: true, recipes: [], msg: '未找到相关菜谱' });
      }

      // 获取第一个菜谱的详情
      const recipes = [];
      for (const id of recipeLinks.slice(0, 2)) {
        try {
          const detailUrl = `https://www.xiachufang.com/recipe/${id}/`;
          const detailResp = await fetch(detailUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
              'Accept-Language': 'zh-CN,zh;q=0.9'
            }
          });
          const detailHtml = await detailResp.text();
          const recipe = parseRecipe(detailHtml);
          if (recipe) {
            recipe.source = `https://www.xiachufang.com/recipe/${id}/`;
            recipes.push(recipe);
          }
        } catch (e) {
          // 单个失败不影响其他
        }
      }

      return jsonResponse({ success: true, recipes });
    } catch (e) {
      return jsonResponse({ success: false, error: '搜索失败，请稍后重试' });
    }
  }
};

function parseRecipe(html) {
  // 提取菜名
  const nameMatch = html.match(/<h1[^>]*class="page-title"[^>]*>(.*?)<\/h1>/s)
    || html.match(/<title[^>]*>([^<]+)- 下厨房<\/title>/);
  if (!nameMatch) return null;

  const name = nameMatch[1].replace(/<[^>]+>/g, '').trim();
  if (!name) return null;

  // 提取原料（用 JSON-LD 结构化数据）
  const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  let ingredients = [];
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      if (ld.recipeIngredient) {
        ingredients = ld.recipeIngredient.map(item => {
          const parts = item.trim().match(/^(.+?)\s*[\(（]?\s*(\d+[^)）]*?)\s*[\)）]?\s*$/);
          return parts
            ? { name: parts[1].trim(), amount: parts[2].trim() }
            : { name: item.trim(), amount: '' };
        });
      }
    } catch (e) {}
  }

  // 备用：从页面提取原料
  if (ingredients.length === 0) {
    const ingRegex = /<td[^>]*class="name"[^>]*>(.*?)<\/td>[\s\S]*?<td[^>]*class="unit"[^>]*>(.*?)<\/td>/g;
    let m;
    while ((m = ingRegex.exec(html)) !== null) {
      ingredients.push({
        name: m[1].replace(/<[^>]+>/g, '').trim(),
        amount: m[2].replace(/<[^>]+>/g, '').trim()
      });
    }
  }

  // 提取步骤
  let steps = [];
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      if (ld.recipeInstructions && Array.isArray(ld.recipeInstructions)) {
        steps = ld.recipeInstructions.map(s =>
          s.text || (typeof s === 'string' ? s : '')
        ).filter(Boolean);
      }
    } catch (e) {}
  }

  // 备用：从页面提取步骤
  if (steps.length === 0) {
    const stepRegex = /<div[^>]*class="text"[^>]*>([\s\S]*?)<\/div>\s*<\/li>/g;
    let m;
    while ((m = stepRegex.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, '').trim();
      if (text) steps.push(text);
    }
  }

  // 提取分类/标签
  const category = '家常菜';
  const tagMatches = html.match(/<div[^>]*class="category"[^>]*>[\s\S]*?<\/div>/s);
  const tags = [];
  if (tagMatches) {
    const tagLinks = tagMatches[0].matchAll(/>([^<]+)<\/a>/g);
    for (const t of tagLinks) {
      if (t[1].trim()) tags.push(t[1].trim());
    }
  }

  return { name, ingredients, steps, category, tags: tags.slice(0, 5) };
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
