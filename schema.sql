-- 食谱表
CREATE TABLE IF NOT EXISTS recipes (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '午餐', -- 早餐/午餐/晚餐/夜宵/甜品/饮品
  difficulty TEXT NOT NULL DEFAULT '简单', -- 简单/中等/困难
  cook_time INTEGER NOT NULL DEFAULT 30, -- 用时(分钟)
  servings INTEGER NOT NULL DEFAULT 2, -- 几人份
  ingredients JSONB NOT NULL DEFAULT '[]', -- [{"name":"番茄","amount":"2个","note":""}]
  steps JSONB NOT NULL DEFAULT '[]', -- ["步骤1...","步骤2..."]
  tags TEXT[] NOT NULL DEFAULT '{}', -- ["鱼","辣","快手菜"]
  excluded BOOLEAN NOT NULL DEFAULT false, -- 今天不想吃
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS策略（匿名可读写，方便双人使用）
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON recipes
  FOR ALL USING (true) WITH CHECK (true);
