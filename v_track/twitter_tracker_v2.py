#!/usr/bin/env python3
"""
Twitter/X Tracker V2
====================
Enhanced version of twitter_scraper.py with two new features:
  1. --from-date: scrape all tweets >= this date (no upper bound)
  2. Daily archive: group all tweets by date into separate daily documents

Usage examples:
  # Scrape all tweets from May 1 2026 onwards (no time upper bound)
  python twitter_tracker_v2.py --from-date 20260501

  # Combine with existing --date mode (one specific day)
  python twitter_tracker_v2.py --date 20260601

  # Use existing --hours mode (last 48 hours)
  python twitter_tracker_v2.py --hours 48

  # Scrape latest topk tweets per account, then archive by day
  python twitter_tracker_v2.py --topk 20

  # Limit to first 5 accounts (for testing)
  python twitter_tracker_v2.py --from-date 20260501 -n 5
"""

import os
import re
import json
import time
import urllib.request
import hashlib
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Dict, Optional
from collections import defaultdict
import logging
from playwright.sync_api import sync_playwright, Page

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('twitter_tracker_v2.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)


class TweetData:
    """Structured tweet data"""
    def __init__(self, tweet_id: str, text: str, created_at: str,
                 metrics: Dict, url: str, scraped_at: str,
                 image_urls: List[str] = None, image_paths: List[str] = None):
        self.id = tweet_id
        self.text = text
        self.created_at = created_at
        self.metrics = metrics
        self.url = url
        self.scraped_at = scraped_at
        self.image_urls = image_urls or []
        self.image_paths = image_paths or []

    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'text': self.text,
            'created_at': self.created_at,
            'metrics': self.metrics,
            'url': self.url,
            'scraped_at': self.scraped_at,
            'image_urls': self.image_urls,
            'image_paths': self.image_paths
        }


class DataManagerV2:
    """Manage tweet data storage and retrieval — V2 with daily archiving."""

    def __init__(self, data_dir: str = 'twitter_data'):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)

        # Create subdirectories
        self.raw_dir = self.data_dir / 'raw'
        self.summary_dir = self.data_dir / 'summaries'
        self.images_dir = self.data_dir / 'images'
        self.raw_dir.mkdir(exist_ok=True)
        self.summary_dir.mkdir(exist_ok=True)
        self.images_dir.mkdir(exist_ok=True)

    def save_daily_data(self, date_str: str, all_tweets: Dict[str, List[TweetData]]):
        """Save daily tweet data with metadata (same as V1 for raw dump)."""
        tweets_dict = {}
        total_count = 0

        for username, tweets in all_tweets.items():
            tweets_dict[username] = [t.to_dict() for t in tweets]
            total_count += len(tweets)

        data = {
            'metadata': {
                'date': date_str,
                'total_tweets': total_count,
                'users_tracked': list(all_tweets.keys()),
                'scraped_at': datetime.now().isoformat(),
                'version': '2.0'
            },
            'tweets': tweets_dict
        }

        filename = self.raw_dir / f'tweets_{date_str}.json'
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        logging.info(f"Saved {total_count} tweets to {filename}")

    # ------------------------------------------------------------------
    # NEW: Daily archive — group all tweets by their created_at date
    # ------------------------------------------------------------------
    def archive_by_day(self, all_tweets: Dict[str, List[TweetData]],
                       run_label: str = '') -> Dict[str, int]:
        """Group all tweets by their actual creation date and save as daily files
        under twitter_data/raw/ with the SAME format as the existing tweets_*.json.

        Each daily file contains ALL accounts' tweets for that day.
        Format: {metadata: {date, total_tweets, users_tracked, ...}, tweets: {user: [...]}}

        Args:
            all_tweets: {username: [TweetData, ...]}
            run_label: optional label for the archive metadata

        Returns:
            {date_str: tweet_count} for each archived day
        """
        # Step 1: bucket tweets by their created_at date
        daily_buckets: Dict[str, Dict[str, List[Dict]]] = defaultdict(lambda: defaultdict(list))

        for username, tweets in all_tweets.items():
            for tweet in tweets:
                day_str = self._tweet_date_str(tweet)
                daily_buckets[day_str][username].append(tweet.to_dict())

        if not daily_buckets:
            logging.info("No tweets to archive by day.")
            return {}

        # Step 2: write each day's file in the SAME format as V1
        day_counts: Dict[str, int] = {}
        sorted_days = sorted(daily_buckets.keys())

        for day_str in sorted_days:
            day_by_user = daily_buckets[day_str]
            # Sort tweets within each user by created_at descending
            for username in day_by_user:
                day_by_user[username].sort(key=lambda t: t.get('created_at', ''), reverse=True)

            # Collect all users and count
            users_in_day = sorted(day_by_user.keys())
            total_tweets = sum(len(ts) for ts in day_by_user.values())

            # Build data in the SAME format as save_daily_data()
            archive_data = {
                'metadata': {
                    'date': day_str,
                    'total_tweets': total_tweets,
                    'users_tracked': users_in_day,
                    'scraped_at': datetime.now().isoformat(),
                    'version': '2.0'
                },
                'tweets': {u: ts for u, ts in sorted(day_by_user.items())}
            }

            # Save to twitter_data/raw/tweets_{date}.json (same naming convention)
            filepath = self.raw_dir / f'tweets_{day_str}.json'
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(archive_data, f, indent=2, ensure_ascii=False)

            day_counts[day_str] = total_tweets
            logging.info(f"  Daily archive: {filepath} ({total_tweets} tweets from {len(users_in_day)} users)")

        logging.info(f"Daily archiving complete: {len(day_counts)} days, "
                     f"{sum(day_counts.values())} total tweets")
        return day_counts

    @staticmethod
    def _tweet_date_str(tweet: TweetData) -> str:
        """Extract YYYY-MM-DD from a tweet's created_at field."""
        if not tweet.created_at:
            return 'unknown_date'
        try:
            dt = datetime.fromisoformat(tweet.created_at.replace('Z', '+00:00'))
            # Convert to local date for intuitive grouping
            local_dt = dt.astimezone()
            return local_dt.strftime('%Y-%m-%d')
        except (ValueError, TypeError):
            return 'unknown_date'

    # ------------------------------------------------------------------
    # Existing methods (unchanged from V1)
    # ------------------------------------------------------------------
    def save_summary(self, date_str: str, summary: str):
        filename = self.summary_dir / f'summary_{date_str}.txt'
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(summary)
        logging.info(f"Saved summary to {filename}")
        return str(filename)

    def download_image(self, url: str, tweet_id: str, index: int) -> Optional[str]:
        try:
            url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
            ext = '.jpg'
            if 'format=png' in url or url.endswith('.png'):
                ext = '.png'
            elif 'format=webp' in url or url.endswith('.webp'):
                ext = '.webp'
            filename = f"{tweet_id}_{index}_{url_hash}{ext}"
            filepath = self.images_dir / filename

            if filepath.exists():
                logging.debug(f"Image already exists: {filepath}")
                return str(filepath)

            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://x.com/'
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                with open(filepath, 'wb') as f:
                    f.write(data)
            logging.info(f"Downloaded image: {filepath} ({len(data)} bytes)")
            return str(filepath)
        except Exception as e:
            logging.warning(f"Failed to download image {url}: {e}")
            return None

    def load_daily_data(self, date_str: str) -> Optional[Dict]:
        filename = self.raw_dir / f'tweets_{date_str}.json'
        if filename.exists():
            with open(filename, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None

    def get_all_dates(self) -> List[str]:
        dates = []
        for file in self.raw_dir.glob('tweets_*.json'):
            date_str = file.stem.replace('tweets_', '')
            dates.append(date_str)
        return sorted(dates, reverse=True)


class TwitterScraperV2:
    """Twitter scraper V2 — with from_date and daily archiving support."""

    BASE_HOST = 'https://x.com'
    ACCOUNTS_FILE = 'accounts.txt'
    COOKIES_FILE = 'cookies.json'

    def __init__(self):
        self.users = self._load_accounts()
        self.data_manager = DataManagerV2()
        self.browser = None
        self.page = None
        self._cookie_files = self._discover_cookie_files()
        self._current_cookie_index = 0
        self._account_count = 0
        self._MAX_ACCOUNTS_PER_COOKIE = 5

    # ------------------------------------------------------------------
    # Account & cookie loading (unchanged logic)
    # ------------------------------------------------------------------
    def _load_accounts(self) -> Dict[str, str]:
        accounts_path = os.path.join(os.path.dirname(__file__), self.ACCOUNTS_FILE)
        users = {}
        if not os.path.exists(accounts_path):
            logging.warning(f"{self.ACCOUNTS_FILE} not found")
            return users
        try:
            with open(accounts_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    username = line.lstrip('@')
                    if username:
                        users[username] = username
            logging.info(f"Loaded {len(users)} accounts from {self.ACCOUNTS_FILE}")
        except Exception as e:
            logging.error(f"Failed to read {self.ACCOUNTS_FILE}: {e}")
        return users

    def _discover_cookie_files(self) -> List[str]:
        base_dir = os.path.dirname(__file__)
        files = []
        primary = os.path.join(base_dir, self.COOKIES_FILE)
        if os.path.exists(primary):
            files.append(primary)
        for i in range(1, 20):
            path = os.path.join(base_dir, f'cookies_{i}.json')
            if os.path.exists(path):
                files.append(path)
        if files:
            logging.info(f"Found {len(files)} cookie file(s)")
        else:
            logging.warning("No cookie files found!")
        return files

    # ------------------------------------------------------------------
    # Browser management (unchanged)
    # ------------------------------------------------------------------
    def start_browser(self, headless: bool = False):
        import tempfile
        playwright = sync_playwright().start()
        self._tmp_browser_dir = tempfile.mkdtemp(prefix='v_track_v2_')

        chrome_args = [
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--no-sandbox',
            '--disable-dev-shm-usage',
        ]

        self.browser = playwright.chromium.launch_persistent_context(
            user_data_dir=self._tmp_browser_dir,
            headless=headless,
            viewport={'width': 1280, 'height': 720},
            locale='en-US',
            args=chrome_args,
            ignore_default_args=['--enable-automation'],
        )

        self.browser.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)

        self.page = self.browser.pages[0] if self.browser.pages else self.browser.new_page()
        logging.info("Browser started with anti-detection measures")
        self._load_cookies()

    def _load_cookies(self, cookie_file: str = None) -> bool:
        if cookie_file is None:
            if self._cookie_files:
                cookie_file = self._cookie_files[self._current_cookie_index % len(self._cookie_files)]
            else:
                cookie_file = os.path.join(os.path.dirname(__file__), self.COOKIES_FILE)

        if not os.path.exists(cookie_file):
            logging.warning(f"{os.path.basename(cookie_file)} not found")
            return False

        try:
            with open(cookie_file, 'r') as f:
                raw_cookies = json.load(f)
        except Exception as e:
            logging.error(f"Failed to read {os.path.basename(cookie_file)}: {e}")
            return False

        same_site_map = {
            'no_restriction': 'None', 'unspecified': 'Lax',
            'lax': 'Lax', 'strict': 'Strict', 'none': 'None',
        }

        converted = []
        for c in raw_cookies:
            domain = c.get('domain', '')
            if 'x.com' not in domain and 'twitter.com' not in domain:
                continue
            cookie = {
                'name': c['name'],
                'value': c['value'],
                'domain': domain,
                'path': c.get('path', '/'),
                'httpOnly': bool(c.get('httpOnly', False)),
                'secure': bool(c.get('secure', False)),
                'sameSite': same_site_map.get(str(c.get('sameSite', 'lax')).lower(), 'Lax'),
            }
            if 'expirationDate' in c and not c.get('session', False):
                cookie['expires'] = int(c['expirationDate'])
            converted.append(cookie)

        if not converted:
            logging.warning("No x.com/twitter.com cookies found")
            return False

        try:
            self.browser.add_cookies(converted)
            logging.info(f"Injected {len(converted)} cookies from {os.path.basename(cookie_file)}")
            return True
        except Exception as e:
            logging.error(f"Failed to inject cookies: {e}")
            return False

    def _rotate_cookie(self):
        if len(self._cookie_files) <= 1:
            return
        self._current_cookie_index = (self._current_cookie_index + 1) % len(self._cookie_files)
        self._account_count = 0
        new_file = self._cookie_files[self._current_cookie_index]
        logging.info(f"Rotating cookie -> {os.path.basename(new_file)}")
        try:
            self.browser.clear_cookies()
        except Exception:
            pass
        self._load_cookies(new_file)

    def check_login(self) -> bool:
        logging.info("Checking login status...")
        try:
            self.page.goto(f'{self.BASE_HOST}/home',
                          wait_until='domcontentloaded', timeout=60000)
            time.sleep(5)

            current_url = self.page.url
            if 'login' in current_url.lower() or 'signin' in current_url.lower():
                logging.warning("Not logged in - redirected to login page")
                return False

            logged_in_selectors = [
                '[data-testid="SideNav_AccountSwitcher_Button"]',
                '[data-testid="AppTabBar_Profile_Link"]',
                '[data-testid="primaryColumn"] [aria-label="Home timeline"]',
            ]
            for selector in logged_in_selectors:
                try:
                    if self.page.query_selector(selector):
                        logging.info(f"Logged in (detected: {selector})")
                        return True
                except Exception:
                    continue

            body_text = (self.page.inner_text('body') or '')[:2000].lower()
            login_prompts = ['sign in to x', 'sign in to twitter', 'log in to x', 'new to x?', 'new to twitter?']
            if any(p in body_text for p in login_prompts):
                logging.warning("Not logged in - login prompt detected")
                return False

            logging.info("Logged in (no login prompts detected)")
            return True
        except Exception as e:
            logging.error(f"Error checking login: {e}")
            return False

    # ------------------------------------------------------------------
    # Tweet scraping core (reused from V1)
    # ------------------------------------------------------------------
    def _click_posts_tab(self, username: str) -> bool:
        try:
            result = self.page.evaluate('''(username) => {
                const tabs = document.querySelectorAll('a[role="tab"]');
                for (const tab of tabs) {
                    const href = tab.getAttribute('href') || '';
                    let path;
                    try { path = new URL(href, window.location.origin).pathname; }
                    catch(e) { path = href; }
                    path = path.replace(/\\/$/, '').toLowerCase();
                    const target = '/' + username.toLowerCase();
                    if (path === target) {
                        if (tab.getAttribute('aria-selected') === 'true') return 'already_selected';
                        tab.click();
                        return 'clicked';
                    }
                }
                const allLinks = document.querySelectorAll('[role="tablist"] a, nav a');
                for (const link of allLinks) {
                    if (link.textContent.trim().toLowerCase() === 'posts') {
                        link.click();
                        return 'clicked_by_text';
                    }
                }
                return 'not_found';
            }''', username)

            if result in ('clicked', 'clicked_by_text'):
                time.sleep(4)
                try:
                    self.page.wait_for_selector('article[data-testid="tweet"]', timeout=10000)
                except Exception:
                    pass
                time.sleep(2)
                return True
            return result == 'already_selected'
        except Exception as e:
            logging.warning(f"Error clicking Posts tab: {e}")
            return False

    def _setup_api_interception(self, username: str):
        self._api_tweets = []
        self._api_responses_captured = 0

        def handle_response(response):
            try:
                url = response.url
                if response.status != 200:
                    return
                if '/i/api/graphql/' not in url:
                    return
                if 'UserTweets' not in url:
                    return
                self._api_responses_captured += 1
                data = response.json()
                tweets = self._parse_api_tweets(data, username)
                if tweets:
                    self._api_tweets.extend(tweets)
                    logging.info(f"API intercepted {len(tweets)} tweets (total: {len(self._api_tweets)})")
            except Exception:
                pass

        self.page.on('response', handle_response)
        return handle_response

    def _parse_api_tweets(self, data: dict, username: str) -> List[TweetData]:
        tweets = []
        try:
            instructions = (data.get('data', {})
                          .get('user', {})
                          .get('result', {})
                          .get('timeline_v2', data.get('data', {}).get('user', {}).get('result', {}).get('timeline', {}))
                          .get('timeline', {})
                          .get('instructions', []))
            if not instructions:
                instructions = (data.get('data', {})
                              .get('user', {})
                              .get('result', {})
                              .get('timeline', {})
                              .get('timeline', {})
                              .get('instructions', []))
            for instruction in instructions:
                for entry in instruction.get('entries', []):
                    tweet = self._extract_tweet_from_entry(entry, username)
                    if tweet:
                        tweets.append(tweet)
        except Exception:
            pass
        return tweets

    def _extract_tweet_from_entry(self, entry: dict, username: str) -> Optional[TweetData]:
        try:
            content = entry.get('content', {})
            item_content = content.get('itemContent', content.get('content', {}).get('itemContent', {}))
            if not item_content:
                return None
            tweet_results = item_content.get('tweet_results', {})
            result = tweet_results.get('result', {})
            if not result or result.get('__typename') not in ('Tweet', 'TweetWithVisibilityResults'):
                if result.get('__typename') == 'TweetWithVisibilityResults':
                    result = result.get('tweet', {})
                elif not result.get('legacy'):
                    return None
            legacy = result.get('legacy', {})
            if not legacy:
                return None
            tweet_id = result.get('rest_id', legacy.get('id_str', ''))
            full_text = legacy.get('full_text', '')
            raw_time = legacy.get('created_at', '')
            created_at = ''
            if raw_time:
                try:
                    dt = datetime.strptime(raw_time, '%a %b %d %H:%M:%S %z %Y')
                    created_at = dt.isoformat()
                except (ValueError, TypeError):
                    created_at = raw_time
            metrics = {
                'replies': legacy.get('reply_count', 0),
                'retweets': legacy.get('retweet_count', 0),
                'likes': legacy.get('favorite_count', 0),
                'views': int(result.get('views', {}).get('count', 0) or 0)
            }
            image_urls = []
            for media in legacy.get('extended_entities', {}).get('media', []) or legacy.get('entities', {}).get('media', []):
                if media.get('type') == 'photo':
                    url = media.get('media_url_https', '')
                    if url:
                        image_urls.append(url + '?format=jpg&name=large')
            if full_text.startswith('RT @'):
                return None
            return TweetData(
                tweet_id=tweet_id, text=full_text, created_at=created_at,
                metrics=metrics, url=f'{self.BASE_HOST}/{username}/status/{tweet_id}',
                scraped_at=datetime.now().isoformat(), image_urls=image_urls
            )
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Time range computation — V2 adds from_date support
    # ------------------------------------------------------------------
    @staticmethod
    def _compute_time_range(hours: float = None, date: str = None,
                            from_date: str = None):
        """Compute (cutoff_start, cutoff_end) for time filtering.

        Priority:
          1. from_date: all tweets >= from_date 00:00 local time (no upper bound)
          2. date: one specific day [date 00:00, date+1 00:00)
          3. hours: last N hours from now
          4. None: no filter

        Returns (cutoff_start_utc, cutoff_end_utc).
        Either or both can be None to indicate no bound.
        """
        if from_date:
            try:
                local_tz = datetime.now().astimezone().tzinfo
                target_local = datetime.strptime(from_date, '%Y%m%d').replace(tzinfo=local_tz)
                start_utc = target_local.astimezone(timezone.utc)
                logging.info(f"from_date filter: tweets >= {target_local.isoformat()} (UTC {start_utc.isoformat()})")
                return start_utc, None  # No upper bound
            except ValueError:
                logging.error(f"Invalid from_date format '{from_date}', expected YYYYMMDD")
                return None, None

        if date:
            try:
                local_tz = datetime.now().astimezone().tzinfo
                target_local = datetime.strptime(date, '%Y%m%d').replace(tzinfo=local_tz)
                start_utc = target_local.astimezone(timezone.utc)
                end_utc = (target_local + timedelta(days=1)).astimezone(timezone.utc)
                return start_utc, end_utc
            except ValueError:
                logging.error(f"Invalid date format '{date}', expected YYYYMMDD")
                return None, None

        if hours and hours > 0:
            return datetime.now(timezone.utc) - timedelta(hours=hours), None

        return None, None

    @staticmethod
    def _is_within_range(tweet: TweetData, cutoff_start: datetime = None,
                         cutoff_end: datetime = None) -> bool:
        if not tweet.created_at:
            return True
        try:
            tweet_dt = datetime.fromisoformat(tweet.created_at.replace('Z', '+00:00'))
            if cutoff_start and tweet_dt < cutoff_start:
                return False
            if cutoff_end and tweet_dt >= cutoff_end:
                return False
            return True
        except (ValueError, TypeError):
            return True

    # ------------------------------------------------------------------
    # scrape_user_tweets — supports from_date mode
    # ------------------------------------------------------------------
    def scrape_user_tweets(self, username: str, max_tweets: int = 50,
                            hours: float = None, date: str = None,
                            from_date: str = None, topk: int = None) -> List[TweetData]:
        """Scrape tweets from a user's profile.

        Args:
            username: Twitter username
            max_tweets: Max in-range tweets to collect
            hours: Last N hours
            date: Specific day YYYYMMDD
            from_date: All tweets >= this date YYYYMMDD (NEW in V2)
            topk: Latest K tweets regardless of time
        """
        if topk and topk > 0:
            cutoff_start, cutoff_end = None, None
            logging.info(f"Scraping latest {topk} tweets from @{username}...")
        else:
            cutoff_start, cutoff_end = self._compute_time_range(hours, date, from_date)

        if cutoff_start and cutoff_end:
            logging.info(f"Scraping @{username} (range: {cutoff_start.isoformat()} ~ {cutoff_end.isoformat()})...")
        elif cutoff_start:
            logging.info(f"Scraping @{username} (from: {cutoff_start.isoformat()}, no upper bound)...")
        else:
            logging.info(f"Scraping @{username} (no time filter)...")

        tweets = []
        self._api_tweets = []
        api_handler = self._setup_api_interception(username)

        url = f'{self.BASE_HOST}/{username}'
        try:
            self.page.goto(url, wait_until='domcontentloaded', timeout=60000)
        except Exception as e:
            logging.error(f"Failed to navigate to {url}: {e}")
            return tweets

        time.sleep(5)
        self._click_posts_tab(username)
        logging.info(f"API responses: {self._api_responses_captured}, API tweets: {len(self._api_tweets)}")

        scroll_count = 0
        max_scrolls = 120  # Higher for from_date mode (may need to scroll far back)
        last_tweet_count = 0
        seen_tweet_ids = set()
        consecutive_no_load = 0
        in_range_count = 0
        effective_max = (topk * 3 + 10) if (topk and topk > 0) else max_tweets

        while scroll_count < max_scrolls:
            new_tweets = self._extract_tweets()

            for tweet in new_tweets:
                if tweet.id not in seen_tweet_ids:
                    tweets.append(tweet)
                    seen_tweet_ids.add(tweet.id)
                    if self._is_within_range(tweet, cutoff_start, cutoff_end):
                        in_range_count += 1

            logging.info(f"Found {len(tweets)} total, {in_range_count} in range...")

            if in_range_count >= effective_max:
                logging.info(f"Reached target of {effective_max} in-range tweets")
                break

            # Early stop: all new tweets are before cutoff_start (too old)
            if cutoff_start and scroll_count >= 3 and new_tweets:
                all_before = True
                for t in new_tweets:
                    if not t.created_at:
                        all_before = False
                        break
                    try:
                        t_dt = datetime.fromisoformat(t.created_at.replace('Z', '+00:00'))
                        if t_dt >= cutoff_start:
                            all_before = False
                            break
                    except (ValueError, TypeError):
                        all_before = False
                        break
                if all_before:
                    logging.info("All new tweets before cutoff — stopping")
                    break

            # No-upper-bound mode (from_date): don't early-stop on "after end"
            # Only early-stop if cutoff_end is set (date mode)

            if len(tweets) == last_tweet_count:
                consecutive_no_load += 1
                if consecutive_no_load >= 3:
                    logging.info("No new tweets loaded after 3 attempts, stopping")
                    break
                if consecutive_no_load == 1:
                    self.page.keyboard.press('End')
                else:
                    self.page.evaluate('window.scrollBy(0, 500)')
                time.sleep(3)
            else:
                consecutive_no_load = 0
                self.page.keyboard.press('End')
                time.sleep(3)

            last_tweet_count = len(tweets)
            scroll_count += 1

        try:
            self.page.remove_listener('response', api_handler)
        except Exception:
            pass

        # Merge API tweets
        if self._api_tweets:
            logging.info(f"Merging {len(self._api_tweets)} API tweets with {len(tweets)} DOM tweets")
            for api_tweet in self._api_tweets:
                if api_tweet.id not in seen_tweet_ids:
                    tweets.append(api_tweet)
                    seen_tweet_ids.add(api_tweet.id)

        # Filter by time range
        if cutoff_start or cutoff_end:
            kept = [t for t in tweets if self._is_within_range(t, cutoff_start, cutoff_end)]
            logging.info(f"Filter: {len(tweets)} -> {len(kept)} in range")
            tweets = kept

        # Sort newest first, filter pinned
        valid = [t for t in tweets if t.created_at]
        valid.sort(key=lambda x: x.created_at, reverse=True)

        if valid and len(valid) > 1:
            try:
                newest_dt = datetime.fromisoformat(valid[0].created_at.replace('Z', '+00:00'))
                pinned_threshold = newest_dt - timedelta(days=30)
                non_pinned = [t for t in valid
                              if datetime.fromisoformat(t.created_at.replace('Z', '+00:00')) >= pinned_threshold]
                if non_pinned:
                    valid = non_pinned
            except (ValueError, TypeError):
                pass

        tweets = valid + [t for t in tweets if not t.created_at]
        tweets = tweets[:max_tweets]

        # Download images
        for tweet in tweets:
            if tweet.image_urls:
                downloaded = []
                for idx, img_url in enumerate(tweet.image_urls):
                    local_path = self.data_manager.download_image(img_url, tweet.id, idx)
                    if local_path:
                        downloaded.append(local_path)
                tweet.image_paths = downloaded

        logging.info(f"Total from @{username}: {len(tweets)} tweets")
        if tweets:
            logging.info(f"Date range: {tweets[-1].created_at} to {tweets[0].created_at}")

        return tweets

    def _extract_tweets(self) -> List[TweetData]:
        tweets = []
        try:
            elements = self.page.query_selector_all('article[data-testid="tweet"]')
            for el in elements:
                try:
                    link = el.query_selector('a[href*="/status/"]')
                    if not link:
                        continue
                    href = link.get_attribute('href')
                    tweet_id = href.split('/status/')[-1].split('?')[0]

                    text_el = el.query_selector('div[data-testid="tweetText"]')
                    text = text_el.inner_text() if text_el else ""

                    image_urls = []
                    for img_el in el.query_selector_all('div[data-testid="tweetPhoto"] img'):
                        src = img_el.get_attribute('src') or ""
                        if src and 'pbs.twimg.com' in src:
                            src = re.sub(r'format=\w+', 'format=jpg', src)
                            src = re.sub(r'name=\w+', 'name=large', src)
                            image_urls.append(src)

                    time_el = el.query_selector('time')
                    created_at = time_el.get_attribute('datetime') if time_el else ""

                    metrics = self._get_metrics(el)

                    tweets.append(TweetData(
                        tweet_id=tweet_id, text=text, created_at=created_at,
                        metrics=metrics, url=f'{self.BASE_HOST}{href}',
                        scraped_at=datetime.now().isoformat(), image_urls=image_urls
                    ))
                except Exception:
                    continue
        except Exception as e:
            logging.error(f"Error extracting tweets: {e}")
        return tweets

    def _get_metrics(self, element) -> Dict:
        metrics = {'replies': 0, 'retweets': 0, 'likes': 0, 'views': 0}
        try:
            for group in element.query_selector_all('div[role="group"]'):
                text = group.inner_text()
                if 'Reply' in text:
                    metrics['replies'] = self._parse_number(text)
                elif 'Repost' in text or 'Retweet' in text:
                    metrics['retweets'] = self._parse_number(text)
                elif 'Like' in text:
                    metrics['likes'] = self._parse_number(text)
                elif 'View' in text:
                    metrics['views'] = self._parse_number(text)
        except Exception:
            pass
        return metrics

    def _parse_number(self, text: str) -> int:
        try:
            for part in text.split():
                part = part.replace(',', '')
                if part[-1].upper() == 'K':
                    return int(float(part[:-1]) * 1000)
                elif part[-1].upper() == 'M':
                    return int(float(part[:-1]) * 1000000)
                elif part.isdigit():
                    return int(part)
        except Exception:
            pass
        return 0

    # ------------------------------------------------------------------
    # Summary generation
    # ------------------------------------------------------------------
    def generate_summary(self, date_str: str, all_tweets: Dict[str, List[TweetData]]) -> str:
        lines = []
        lines.append(f"Daily Twitter Tracking Summary (V2)")
        lines.append(f"Date: {date_str}")
        lines.append(f"{'=' * 60}\n")

        for username, tweets in all_tweets.items():
            lines.append(f"@{username}")
            lines.append(f"{'-' * 60}")
            if not tweets:
                lines.append("  No posts found\n")
                continue

            lines.append(f"  Total Posts: {len(tweets)}")
            total_likes = sum(t.metrics['likes'] for t in tweets)
            total_retweets = sum(t.metrics['retweets'] for t in tweets)
            total_replies = sum(t.metrics['replies'] for t in tweets)
            total_views = sum(t.metrics['views'] for t in tweets)
            lines.append(f"  Likes: {total_likes:,} | Retweets: {total_retweets:,} | "
                        f"Replies: {total_replies:,} | Views: {total_views:,}\n")

            for idx, tweet in enumerate(tweets, 1):
                if tweet.created_at:
                    dt = datetime.fromisoformat(tweet.created_at.replace('Z', '+00:00'))
                    time_str = dt.strftime('%Y-%m-%d %H:%M')
                else:
                    time_str = 'Unknown'
                lines.append(f"  {idx}. [{time_str}] {tweet.text[:100]}")
                lines.append(f"     {tweet.url}")

            lines.append("")

        lines.append(f"{'=' * 60}")
        lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        return '\n'.join(lines)

    def close(self):
        if self.browser:
            self.browser.close()
            logging.info("Browser closed")
        if hasattr(self, '_tmp_browser_dir') and self._tmp_browser_dir:
            try:
                shutil.rmtree(self._tmp_browser_dir, ignore_errors=True)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Batch pause settings
    # ------------------------------------------------------------------
    _BATCH_SIZE = 10
    _BATCH_PAUSE_SECONDS = 300

    # ------------------------------------------------------------------
    # Main entry point — V2 with from_date + daily archive
    # ------------------------------------------------------------------
    def run_tracking(self, headless: bool = False, hours: float = None,
                     date: str = None, from_date: str = None,
                     n: int = 9999, topk: int = None):
        """Main function — scrape and archive.

        New in V2:
          - from_date: scrape all tweets >= this date (no upper bound)
          - After scraping, automatically archive tweets into daily files
        """
        try:
            logging.info("=" * 60)
            logging.info("Starting Twitter tracking V2...")

            mode_desc = self._describe_mode(hours, date, from_date, topk)
            logging.info(f"Mode: {mode_desc}")

            self.start_browser(headless=headless)

            if not self.check_login():
                logging.error("Not logged in. Exiting.")
                return

            # Date string for the raw dump file
            date_str = datetime.now().strftime('%Y-%m-%d')
            if date:
                date_str = f"{date[:4]}-{date[4:6]}-{date[6:8]}"

            all_tweets = {}
            accounts_to_scrape = list(self.users.items())[:n]
            if n < len(self.users):
                logging.info(f"Limiting to first {n} of {len(self.users)} accounts")

            total_scraped = 0

            for username_key, username in accounts_to_scrape:
                if self._account_count >= self._MAX_ACCOUNTS_PER_COOKIE:
                    self._rotate_cookie()

                try:
                    logging.info(f"Scraping @{username}... (batch {total_scraped % self._BATCH_SIZE + 1}/{self._BATCH_SIZE})")
                    tweets = self.scrape_user_tweets(
                        username, max_tweets=topk or 50,
                        hours=hours, date=date, from_date=from_date, topk=topk
                    )
                    all_tweets[username_key] = tweets
                    logging.info(f"Scraped {len(tweets)} tweets from @{username}")
                except Exception as e:
                    logging.error(f"Failed to scrape @{username}: {e}")
                    all_tweets[username_key] = []

                self._account_count += 1
                total_scraped += 1

                # Batch pause
                if total_scraped % self._BATCH_SIZE == 0 and total_scraped < len(accounts_to_scrape):
                    remaining = len(accounts_to_scrape) - total_scraped
                    logging.info(f"Batch pause: {total_scraped}/{len(accounts_to_scrape)} done. "
                                f"Waiting {self._BATCH_PAUSE_SECONDS}s ({remaining} remaining)")
                    time.sleep(self._BATCH_PAUSE_SECONDS)
                else:
                    logging.info("Waiting 30s before next account...")
                    time.sleep(30)

            # Save raw dump (same format as V1)
            self.data_manager.save_daily_data(date_str, all_tweets)

            # Generate and save summary
            summary = self.generate_summary(date_str, all_tweets)
            summary_file = self.data_manager.save_summary(date_str, summary)

            # ============================================================
            # NEW in V2: Archive tweets into daily files
            # ============================================================
            logging.info("=" * 40)
            logging.info("Archiving tweets by day...")
            run_label = from_date or date or f"last_{hours}h" or "topk"
            day_counts = self.data_manager.archive_by_day(all_tweets, run_label=run_label)

            # Print results
            print("\n" + summary)
            print(f"\nTracking complete! Mode: {mode_desc}")
            print(f"Raw data: twitter_data/raw/tweets_{date_str}.json")
            print(f"Summary:  {summary_file}")

            if day_counts:
                print(f"\nDaily archives ({len(day_counts)} days):")
                for day, count in sorted(day_counts.items()):
                    print(f"  {day}: {count} tweets -> twitter_data/raw/tweets_{day}.json")

            return summary

        except Exception as e:
            logging.error(f"Error during tracking: {e}")
            raise
        finally:
            self.close()

    @staticmethod
    def _describe_mode(hours, date, from_date, topk) -> str:
        if topk:
            return f"topk={topk} (latest K tweets, no time filter)"
        if from_date:
            formatted = f"{from_date[:4]}-{from_date[4:6]}-{from_date[6:8]}"
            return f"from_date={formatted} (all tweets >= this date)"
        if date:
            formatted = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
            return f"date={formatted} (single day)"
        if hours:
            return f"hours={hours} (last {hours} hours)"
        return "all tweets (no time filter)"


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(
        description='Twitter Tracker V2 — with from_date and daily archiving',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Scrape all tweets from May 1 2026 onwards
  python twitter_tracker_v2.py --from-date 20260501

  # Scrape last 48 hours
  python twitter_tracker_v2.py --hours 48

  # Scrape a specific date
  python twitter_tracker_v2.py --date 20260601

  # Latest 20 tweets per account, then archive by day
  python twitter_tracker_v2.py --topk 20

  # Test with first 3 accounts
  python twitter_tracker_v2.py --from-date 20260501 -n 3 --headless
        """
    )

    # Time filter modes (mutually exclusive)
    time_group = parser.add_mutually_exclusive_group()
    time_group.add_argument('--hours', type=float, default=None,
                           help='Scrape tweets from the last N hours')
    time_group.add_argument('--date', type=str, default=None,
                           help='Scrape tweets for a specific date (YYYYMMDD)')
    time_group.add_argument('--from-date', type=str, default=None, dest='from_date',
                           help='Scrape all tweets >= this date (YYYYMMDD). No upper time bound.')
    time_group.add_argument('--topk', type=int, default=None,
                           help='Get latest K tweets per account (no time filter)')

    # Other options
    parser.add_argument('--headless', action='store_true',
                       help='Run browser in headless mode')
    parser.add_argument('-n', type=int, default=9999,
                       help='Only scrape first N accounts (default: all)')

    args = parser.parse_args()

    scraper = TwitterScraperV2()
    scraper.run_tracking(
        headless=args.headless,
        hours=args.hours,
        date=args.date,
        from_date=args.from_date,
        n=args.n,
        topk=args.topk,
    )
