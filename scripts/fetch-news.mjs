#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import matter from 'gray-matter';

const ROOT = resolve(import.meta.dirname || '.', '..');
const DAILY_DIR = resolve(ROOT, 'daily');
const TODAY = new Date().toISOString().slice(0, 10);
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// ====== 数据源 ======

async function fetchGitHubTrending() {
  try {
    const res = await fetch('https://api.github.com/search/repositories?q=topic:artificial-intelligence+created:>' +
      new Date(Date.now()-7*86400000).toISOString().slice(0,10) + '&sort=stars&per_page=10');
    const data = await res.json();
    return (data.items||[]).slice(0,8).map(r => ({
      title: r.full_name,
      url: r.html_url,
      desc: (r.description||'').slice(0,200),
      stars: r.stargazers_count,
      source: 'GitHub Trending',
    }));
  } catch(e) { console.error('GitHub fetch failed:', e.message); return []; }
}

async function fetchHuggingFace() {
  try {
    // 需要翻墙，确保 Clash 已开启系统代理
    const res = await fetch('https://huggingface.co/api/daily_papers?limit=8');
    const data = await res.json();
    return (data||[]).slice(0,8).map(p => ({
      title: p.title || p.paper?.title || '',
      url: `https://huggingface.co/papers/${p.paper?.id || ''}`,
      desc: (p.paper?.summary || '').slice(0,200),
      upvotes: p.upvotes || 0,
      source: 'HuggingFace Daily Papers',
    }));
  } catch(e) { console.error('HF fetch failed:', e.message); return []; }
}

async function fetchHackerNews() {
  try {
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const ids = (await topRes.json()).slice(0, 30);
    const items = [];
    for (const id of ids.slice(0, 15)) {
      const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      const item = await itemRes.json();
      if (item && (item.title||'').toLowerCase().match(/ai|llm|gpt|model|openai|anthropic|deepseek|agent|ml/)) {
        items.push({
          title: item.title,
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          desc: '',
          score: item.score || 0,
          source: 'Hacker News',
        });
      }
    }
    return items.slice(0, 8);
  } catch(e) { console.error('HN fetch failed:', e.message); return []; }
}

// ====== AI 摘要 ======

async function summarizeWithDeepSeek(items) {
  if (!DEEPSEEK_KEY) { console.error('No DeepSeek key'); return items; }

  const prompt = `你是一个 AI 新闻编辑。以下是从多个来源收集的 AI 领域最新资讯。请：

1. 去重——标题或内容相似的条目只保留一个
2. 筛选——只保留真正重要的 10-15 条
3. 分组——按类别分组（📰 新闻 / 📄 论文 / 🔧 开源项目）
4. 每条用 1-2 句中文总结，保留原文链接
5. 不重要或重复的条目直接丢弃

原始资讯：
${items.map((item, i) => `
[${i+1}] [${item.source}] ${item.title}
${item.desc || ''}
${item.url}
`).join('\n')}

请输出结构化日报：`;

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 3000,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'AI 摘要生成失败';
}

// ====== 主流程 ======

async function main() {
  console.log('📡 AI News Radar — 采集今日 AI 资讯\n');

  mkdirSync(DAILY_DIR, { recursive: true });

  // 1. 采集
  console.log('📥 采集数据...');
  const [github, hf, hn] = await Promise.all([
    fetchGitHubTrending(),
    fetchHuggingFace(),
    fetchHackerNews(),
  ]);

  const allItems = [...github, ...hf, ...hn];
  console.log(`   GitHub: ${github.length} | HuggingFace: ${hf.length} | HN: ${hn.length}`);
  console.log(`   共 ${allItems.length} 条原始资讯\n`);

  // 2. AI 筛选摘要
  console.log('🧠 DeepSeek 筛选摘要...');
  const digest = await summarizeWithDeepSeek(allItems);

  // 3. 写入日报
  const frontmatter = {
    date: TODAY,
    sources: ['GitHub Trending', 'HuggingFace Daily Papers', 'Hacker News'],
    total_raw: allItems.length,
  };
  const content = matter.stringify(digest, frontmatter);

  const filePath = resolve(DAILY_DIR, `${TODAY}-ai-news-zh.md`);
  writeFileSync(filePath, content, 'utf-8');
  console.log(`✅ 日报已保存: daily/${TODAY}-ai-news-zh.md`);
  console.log(`   共 ${digest.length} 字`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
