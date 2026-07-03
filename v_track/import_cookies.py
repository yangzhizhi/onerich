#!/usr/bin/env python3
"""
Import cookies from your browser to bypass Twitter login detection.
"""

import os
import json
from playwright.sync_api import sync_playwright
import time

def import_cookies():
    """Import cookies from cookies.json file"""
    
    cookies_file = 'cookies.json'
    
    if not os.path.exists(cookies_file):
        print("❌ cookies.json not found!")
        print("\n📋 How to get cookies:")
        print("1. Open Chrome and login to Twitter")
        print("2. Install 'EditThisCookie' extension")
        print("3. Go to twitter.com")
        print("4. Click extension -> Export")
        print("5. Save as cookies.json in this directory")
        return False
    
    print("📝 Loading cookies from cookies.json...")
    with open(cookies_file, 'r') as f:
        cookies = json.load(f)
    
    print(f"✅ Loaded {len(cookies)} cookies")
    
    # Setup browser
    playwright = sync_playwright().start()
    user_data_dir = os.path.join(os.path.dirname(__file__), 'browser_data')
    os.makedirs(user_data_dir, exist_ok=True)
    
    # Anti-detection
    chrome_args = [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-sandbox',
    ]
    
    browser = playwright.chromium.launch_persistent_context(
        user_data_dir=user_data_dir,
        headless=False,
        viewport={'width': 1280, 'height': 720},
        args=chrome_args,
        ignore_default_args=['--enable-automation'],
    )
    
    browser.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    """)
    
    page = browser.pages[0] if browser.pages else browser.new_page()
    
    print("🍪 Adding cookies to browser...")
    twitter_cookies = [c for c in cookies if 'twitter' in c.get('domain', '') or 'x.com' in c.get('domain', '')]
    
    if not twitter_cookies:
        print("❌ No Twitter cookies found!")
        browser.close()
        return False
    
    print(f"✅ Found {len(twitter_cookies)} Twitter cookies")
    page.context.add_cookies(twitter_cookies)
    
    print("🔍 Testing login...")
    page.goto('https://twitter.com/home', wait_until='domcontentloaded', timeout=60000)
    time.sleep(3)
    
    if 'login' in page.url.lower():
        print("❌ Login failed! Cookies may be expired.")
        print("💡 Please get fresh cookies from your browser")
        browser.close()
        return False
    else:
        print("✅ Login successful!")
        print("✅ You can now run: python3 twitter_scraper.py --headless")
        time.sleep(2)
        browser.close()
        return True

if __name__ == '__main__':
    print("="*60)
    print("Twitter Cookie Import Tool")
    print("="*60)
    print()
    
    success = import_cookies()
    
    if success:
        print("\n🎉 All set! You can now use the scraper.")
    else:
        print("\n⚠️  Please follow the instructions above.")
