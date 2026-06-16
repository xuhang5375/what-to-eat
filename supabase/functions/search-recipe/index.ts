// Supabase Edge Function: search-recipe
// 部署方式：在 Supabase Dashboard → Edge Functions → New Function → 粘贴此代码

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const keyword = url.searchParams.get("keyword");
  
  if (!keyword) {
    return new Response(JSON.stringify({ error: "请提供 keyword 参数" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Step 1: 搜索下厨房，获取第一个食谱链接
    const searchUrl = `https://www.xiachufang.com/search/?keyword=${encodeURIComponent(keyword)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
    });
    const searchHtml = await searchRes.text();
    
    // 从搜索结果中提取食谱链接 (recipe/数字/)
    const recipeLinkMatch = searchHtml.match(/href="\/recipe\/(\d+)\/"/);
    
    if (!recipeLinkMatch) {
      // 搜索页可能是动态渲染的，尝试用百度搜索
      const baiduUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword + " 下厨房 做法")}`;
      const baiduRes = await fetch(baiduUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const baiduHtml = await baiduRes.text();
      
      // 从百度结果提取下厨房链接
      const baiduMatch = baiduHtml.match(/xiachufang\.com\/recipe\/(\d+)/);
      
      if (!baiduMatch) {
        return new Response(JSON.stringify({ error: "未找到相关食谱", keyword }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      
      // 用百度找到的链接抓取详情
      return await fetchRecipeDetail(baiduMatch[1], keyword);
    }
    
    return await fetchRecipeDetail(recipeLinkMatch[1], keyword);
    
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function fetchRecipeDetail(recipeId: string, keyword: string) {
  const detailUrl = `https://www.xiachufang.com/recipe/${recipeId}/`;
  const detailRes = await fetch(detailUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/html",
    },
  });
  const html = await detailRes.text();
  
  // 解析食材
  const ingredients: Array<{ name: string; amount: string }> = [];
  // 下厨房食材在 <div class="ingredient"> 或 table 中
  const ingMatches = html.matchAll(/<td[^>]*class="name"[^>]*>[\s]*<a[^>]*>([^<]+)<\/a>[\s]*<\/td>[\s]*<td[^>]*class="name"[^>]*>[\s]*([^<]*)<\/td>/g);
  for (const m of ingMatches) {
    ingredients.push({ name: m[1].trim(), amount: m[2].trim() });
  }
  
  // 另一种食材格式
  if (ingredients.length === 0) {
    const ingMatches2 = html.matchAll(/<div[^>]*class="ingredient"[^>]*>[\s\S]*?<p[^>]*>([^<]+)<\/p>[\s\S]*?<p[^>]*>([^<]+)<\/p>/g);
    for (const m of ingMatches2) {
      ingredients.push({ name: m[1].trim(), amount: m[2].trim() });
  }
  }

  // 解析步骤
  const steps: string[] = [];
  const stepMatches = html.matchAll(/<div[^>]*class="step"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g);
  for (const m of stepMatches) {
    const step = m[1].replace(/<[^>]+>/g, "").trim();
    if (step) steps.push(step);
  }
  
  // 另一种步骤格式
  if (steps.length === 0) {
    const stepMatches2 = html.matchAll(/<li[^>]*class="step"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g);
    for (const m of stepMatches2) {
      const step = m[1].replace(/<[^>]+>/g, "").trim();
      if (step) steps.push(step);
    }
  }

  // 解析分类
  const category = "午餐"; // 默认
  const difficulty = ingredients.length > 8 ? "中等" : "简单";
  
  return new Response(JSON.stringify({
    name: keyword,
    category,
    difficulty,
    cook_time: 30,
    servings: 2,
    ingredients,
    steps,
    source: `下厨房 recipe/${recipeId}`,
    source_url: detailUrl,
  }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}