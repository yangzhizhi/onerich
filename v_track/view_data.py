#!/usr/bin/env python3
"""
View historical Twitter tracking data
"""

import os
import json
from datetime import datetime
from pathlib import Path

def view_data(date_str: str = None):
    """View tracking data for a specific date or latest"""
    
    data_dir = Path('twitter_data/raw')
    
    if not data_dir.exists():
        print("❌ No data found. Run the scraper first.")
        return
    
    # Get available dates
    json_files = sorted(data_dir.glob('tweets_*.json'), reverse=True)
    
    if not json_files:
        print("❌ No data files found.")
        return
    
    # Use specified date or latest
    if date_str:
        file_path = data_dir / f'tweets_{date_str}.json'
        if not file_path.exists():
            print(f"❌ No data for {date_str}")
            print(f"\nAvailable dates:")
            for f in json_files[:10]:
                print(f"  - {f.stem.replace('tweets_', '')}")
            return
    else:
        file_path = json_files[0]
        date_str = file_path.stem.replace('tweets_', '')
    
    # Load data
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Display metadata
    metadata = data.get('metadata', {})
    print("="*60)
    print(f"📊 Twitter Tracking Data")
    print(f"📅 Date: {metadata.get('date', date_str)}")
    print(f"📝 Total Tweets: {metadata.get('total_tweets', 0)}")
    print(f"👥 Users: {', '.join(metadata.get('users_tracked', []))}")
    print(f"⏰ Scraped at: {metadata.get('scraped_at', 'N/A')}")
    print("="*60)
    print()
    
    # Display tweets by user
    tweets = data.get('tweets', {})
    
    for username, user_tweets in tweets.items():
        print(f"\n👤 @{username}")
        print(f"{'-'*60}")
        print(f"  Posts: {len(user_tweets)}")
        
        if not user_tweets:
            print("  No posts found\n")
            continue
        
        # Calculate engagement
        total_likes = sum(t['metrics']['likes'] for t in user_tweets)
        total_retweets = sum(t['metrics']['retweets'] for t in user_tweets)
        total_replies = sum(t['metrics']['replies'] for t in user_tweets)
        total_views = sum(t['metrics']['views'] for t in user_tweets)
        
        print(f"  ❤️  Likes: {total_likes:,}")
        print(f"  🔄 Retweets: {total_retweets:,}")
        print(f"  💬 Replies: {total_replies:,}")
        print(f"  👁️ Views: {total_views:,}\n")
        
        # List tweets
        for idx, tweet in enumerate(user_tweets, 1):
            created = tweet.get('created_at', 'Unknown')
            if created and created != 'Unknown':
                try:
                    dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                    time_str = dt.strftime('%Y-%m-%d %H:%M')
                except:
                    time_str = created
            else:
                time_str = 'Unknown'
            
            print(f"  {idx}. [{time_str}]")
            print(f"     {tweet['text']}")
            print(f"     👍 {tweet['metrics']['likes']:,} | 🔄 {tweet['metrics']['retweets']:,} | 💬 {tweet['metrics']['replies']:,}")
            print(f"     🔗 {tweet.get('url', 'N/A')}")
            print()

def list_dates():
    """List all available dates"""
    
    data_dir = Path('twitter_data/raw')
    
    if not data_dir.exists():
        print("❌ No data found.")
        return
    
    json_files = sorted(data_dir.glob('tweets_*.json'), reverse=True)
    
    if not json_files:
        print("❌ No data files found.")
        return
    
    print("📅 Available dates:")
    print("="*40)
    for f in json_files:
        date_str = f.stem.replace('tweets_', '')
        with open(f, 'r', encoding='utf-8') as file:
            data = json.load(file)
            total = data.get('metadata', {}).get('total_tweets', 0)
        print(f"  {date_str} - {total} tweets")

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='View Twitter tracking data')
    parser.add_argument('--date', type=str, help='View data for specific date (YYYY-MM-DD)')
    parser.add_argument('--list', action='store_true', help='List all available dates')
    args = parser.parse_args()
    
    if args.list:
        list_dates()
    else:
        view_data(args.date)
