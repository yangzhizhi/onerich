# Twitter/X Daily Tracker

自动追踪指定用户的每日帖子并生成结构化总结。

## 功能特性

- ✅ 自动获取用户最新帖子
- ✅ 统计互动数据（点赞、转发、评论、浏览）
- ✅ 生成每日总结报告
- ✅ 结构化数据存储（JSON 格式）
- ✅ 支持定时自动执行

## 快速开始

### 1. 安装

```bash
chmod +x setup.sh
./setup.sh
```

### 2. 测试设置

```bash
python3 test_setup.py
```

### 3. 导入 Cookie

```bash
# 1. 在 Chrome 中登录 Twitter
# 2. 安装 EditThisCookie 扩展
# 3. 导出 cookies 保存为 cookies.json
# 4. 运行导入
python3 import_cookies.py
```

### 4. 运行爬虫

```bash
# 手动运行
python3 twitter_scraper.py

# 后台运行（推荐）
python3 twitter_scraper.py --headless
```

### 5. 定时执行（可选）

```bash
crontab -e
# 添加：0 20 * * * /Users/dengdeng/qoder/finfree/run_daily.sh
```

## 数据存储结构

```
twitter_data/
├── raw/                      # 原始数据
│   ├── tweets_2026-05-10.json
│   └── tweets_2026-05-11.json
└── summaries/                # 总结报告
    ├── summary_2026-05-10.txt
    └── summary_2026-05-11.txt
```

### 数据格式示例

```json
{
  "metadata": {
    "date": "2026-05-10",
    "total_tweets": 15,
    "users_tracked": ["jukan05", "alebitoreddit"],
    "scraped_at": "2026-05-10T11:06:50",
    "version": "2.0"
  },
  "tweets": {
    "jukan05": [
      {
        "id": "1976950774547824810",
        "text": "推文内容...",
        "created_at": "2025-10-11T09:59:29.000Z",
        "metrics": {
          "replies": 10,
          "retweets": 50,
          "likes": 200,
          "views": 5000
        },
        "url": "https://twitter.com/jukan05/status/1976950774547824810",
        "scraped_at": "2026-05-10T11:06:50"
      }
    ]
  }
}
```

## 自定义

### 修改追踪的用户

编辑 `twitter_scraper.py` 中的 `self.users`：

```python
self.users = {
    'jukan05': 'jukan05',
    'alebitoreddit': 'alebitoreddit',
    'newuser': 'newuser'  # 添加新用户
}
```

## 故障排除

### 页面加载超时
- 检查网络连接
- 手动访问 https://twitter.com 确认可以访问
- 运行测试脚本: `python3 test_setup.py`

### Cookie 失效
- 重新从浏览器导出 cookies.json
- 运行: `python3 import_cookies.py`

### 其他问题
- 查看日志: `twitter_tracker.log`
- 确保已安装浏览器: `playwright install chromium`
