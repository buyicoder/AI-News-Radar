# AI News Radar — 个人 AI 资讯雷达

> 每天自动采集 GitHub Trending + HuggingFace 论文 + Hacker News 的 AI 资讯，DeepSeek 智能筛选摘要，生成一份中英双语日报。

## 数据源

| 源 | 内容 | 需要翻墙 |
|----|------|---------|
| GitHub Trending | AI/ML 开源项目 top 8 | 否 |
| HuggingFace Daily Papers | 每日热门 AI 论文 top 8 | 是 |
| Hacker News | 前 30 条中 AI 相关的 top 8 | 是（部分） |

## 使用

```bash
git clone https://github.com/buyicoder/AI-News-Radar.git
cd AI-News-Radar
npm install

# 运行前确保 Clash 已开启（HuggingFace 需要翻墙）
export DEEPSEEK_API_KEY="sk-your-key"
node scripts/fetch-news.mjs

# 输出: daily/2026-06-21-ai-news-zh.md
```

## 日报格式

```markdown
# 🤖 AI 每日精选日报

## 📰 新闻
1. **标题**
   2-3 句中文总结
   原文链接

## 📄 论文
2. **Paper Title**
   核心贡献描述

## 🔧 开源项目
3. **repo-name**
   项目简介 + 星数
```

## 与 Jarvis 集成

Jarvis 每天早上 9:17 自动运行 `ingest-news.mjs`，将今日日报导入记忆库。问"今天有什么 AI 资讯"直接回答。

## License

MIT
