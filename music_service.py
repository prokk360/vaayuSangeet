from ytmusicapi import YTMusic
import yt_dlp
import asyncio

ytmusic = YTMusic()

async def search_and_get_stream(song_query: str):
    search_results = ytmusic.search(song_query, filter="songs")
    
    if not search_results:
        return None
        
    top_result_id = search_results[0]['videoId']
    video_url = f"https://music.youtube.com/watch?v={top_result_id}" 
    
    # Configure yt-dlp to extract the raw audio stream
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True
    }
    
    # Run blocking yt-dlp extraction in a separate thread to keep FastAPI fast
    def fetch_direct_url():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            return info['url']
            
    try:
        stream_url = await asyncio.to_thread(fetch_direct_url)
        return stream_url
    except Exception as e:
        print(f"Error extracting stream: {e}")
        return None