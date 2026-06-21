#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import matter from 'gray-matter';

const ROOT = resolve(import.meta.dirname || '.', '..');
const DAILY_DIR = resolve(ROOT, 'daily');
const TODAY = new Date().toISOString().slice(0, 10);
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';

// Node.js 原生 fetch 在 Windows 上不自动走系统代理，被墙的请求用 curl 兜底
function fetchBlocked(url, timeout = 15000) {
  try {
    const result = execSync(`curl -s --proxy ${PROXY} --connect-timeout 8 -m 12 "${url}"`, {
      encoding: 'utf-8', timeout, maxBuffer: 5 * 1024 * 1024, windowsHide: true,
    });
    return { ok: true, json: () => JSON.parse(result), text: () => result };
  } catch (e) {
    return { ok: false, json: () => { throw e; }, text: () => '' };
  }
}
function fetchDirect(url) { return fetch(url); }

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
    const res = fetchBlocked('https://huggingface.co/api/daily_papers?limit=8');
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
    const topRes = fetchBlocked('https://hacker-news.firebaseio.com/v0/topstories.json', 10000);
    const ids = topRes.json().slice(0, 12);
    const items = [];
    for (const id of ids) {
      try {
        const itemRes = fetchBlocked(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 6000);
        const item = itemRes.json();
        if (item && (item.title||'').toLowerCase().match(/ai|llm|gpt|model|openai|anthropic|deepseek|agent|ml/)) {
          items.push({
            title: item.title,
            url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
            desc: '',
            score: item.score || 0,
            source: 'Hacker News',
          });
        }
      } catch { /* skip failed items */ }
    }
    return items.slice(0, 8);
  } catch(e) { console.error('HN fetch failed:', e.message); return []; }
}

// ====== AI 摘要（Loop Engineering：Researcher → Writer → Reviewer） ======

async function summarizeWithDeepSeek(items) {
  if (!DEEPSEEK_KEY) { console.error('No DeepSeek key'); return items.map(i => `- [${i.source}] ${i.title}`).join('\n'); }

  // 使用子Agent管道
  const { pipelineAgent } = await import('../../AIZZL/Jarvis/scripts/lib/subagents.mjs');
  const sources = {
    github: items.filter(i => i.source === 'GitHub Trending').map(i => ({ title: i.title, desc: i.desc, url: i.url, stars: i.stars })),
    huggingface: items.filter(i => i.source === 'HuggingFace Daily Papers').map(i => ({ title: i.title, desc: i.desc, url: i.url, upvotes: i.upvotes })),
    hackernews: items.filter(i => i.source === 'Hacker News').map(i => ({ title: i.title, url: i.url, score: i.score })),
  };

  console.log('  🧠 Researcher → Writer → Reviewer 管道...');
  return await pipelineAgent('AI 领域最新资讯', sources);
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
