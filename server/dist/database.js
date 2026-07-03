"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const DB_PATH = path_1.default.join(__dirname, '..', 'data', 'onerich.db');
let db;
function getDb() {
    if (!db) {
        // Ensure data directory exists
        const fs = require('fs');
        const dir = path_1.default.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        db = new better_sqlite3_1.default(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initializeSchema(db);
    }
    return db;
}
function initializeSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS xv_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      overall_summary TEXT NOT NULL DEFAULT '',
      key_topics TEXT NOT NULL DEFAULT '[]',
      stock_mentions TEXT NOT NULL DEFAULT '[]',
      ai_company_mentions TEXT NOT NULL DEFAULT '[]',
      market_sentiment TEXT NOT NULL DEFAULT '',
      notable_images TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );

    -- X-V raw tweets (one row per scraped tweet)
    -- Replaces the per-day tweets_*.json files for serving/queries.
    -- JSON files are still written as backup by the scraper.
    CREATE TABLE IF NOT EXISTS xv_tweets (
      id TEXT PRIMARY KEY,                -- Twitter tweet id (globally unique)
      username TEXT NOT NULL,             -- @handle (without @)
      text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,           -- ISO 8601 timestamp from Twitter
      date TEXT NOT NULL,                 -- YYYY-MM-DD (local) — denormalized for grouping
      replies INTEGER NOT NULL DEFAULT 0,
      retweets INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL DEFAULT '',
      image_urls TEXT NOT NULL DEFAULT '[]',  -- JSON array of remote URLs
      image_paths TEXT NOT NULL DEFAULT '[]', -- JSON array of local filenames
      scraped_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE INDEX IF NOT EXISTS idx_xv_tweets_date ON xv_tweets(date);
    CREATE INDEX IF NOT EXISTS idx_xv_tweets_username ON xv_tweets(username);
    CREATE INDEX IF NOT EXISTS idx_xv_tweets_created_at ON xv_tweets(created_at);
  `);
}
exports.default = getDb;
//# sourceMappingURL=database.js.map