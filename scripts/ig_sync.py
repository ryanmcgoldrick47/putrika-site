#!/usr/bin/env python3
"""Daily Instagram sync for putrika.net.

Pulls the latest posts from Putrika's Instagram through the official
Instagram API, saves the images and videos into ig/media/, and writes
ig/feed.json for the "moments" section of the site.

Needs the IG_TOKEN environment variable (a long-lived Instagram token).
If the token gets refreshed, the new one is written to .ig_new_token so
the GitHub workflow can save it back as a secret.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

API = 'https://graph.instagram.com'
OUT = 'ig'
MEDIA = os.path.join(OUT, 'media')
LIMIT = 12                  # posts kept on the site
MAX_VIDEO = 25 * 1024 * 1024  # skip videos bigger than 25 MB
FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}'


def get_json(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def download(url, path, max_bytes=None):
    if os.path.exists(path):
        return True
    req = urllib.request.Request(url, headers={'User-Agent': 'putrika.net sync'})
    with urllib.request.urlopen(req, timeout=120) as r:
        size = int(r.headers.get('Content-Length') or 0)
        if max_bytes and size > max_bytes:
            print('skip (too big):', path, size)
            return False
        data = r.read()
    if max_bytes and len(data) > max_bytes:
        print('skip (too big):', path, len(data))
        return False
    tmp = path + '.part'
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, path)
    return True


def first_line(caption, n=140):
    line = (caption or '').strip().split('\n')[0].strip()
    return line if len(line) <= n else line[:n - 1].rstrip() + '…'


def main():
    token = os.environ.get('IG_TOKEN', '').strip()
    if not token:
        sys.exit('IG_TOKEN is not set')

    # Keep the token alive (long-lived tokens last 60 days; refreshing resets that).
    try:
        r = get_json(API + '/refresh_access_token?' + urllib.parse.urlencode({'grant_type': 'ig_refresh_token', 'access_token': token}))
        new = r.get('access_token')
        if new and new != token:
            with open('.ig_new_token', 'w') as f:
                f.write(new)
            token = new
        print('token ok, expires in about', int(r.get('expires_in', 0) / 86400), 'days')
    except Exception as e:
        print('token refresh skipped:', e)

    data = get_json(API + '/me/media?' + urllib.parse.urlencode({'fields': FIELDS, 'limit': LIMIT, 'access_token': token}))
    os.makedirs(MEDIA, exist_ok=True)
    keep, posts, moments = set(), [], []

    def save_img(item_id, url):
        if not url:
            return None
        name = item_id + '.jpg'
        try:
            if download(url, os.path.join(MEDIA, name)):
                keep.add(name)
                return 'ig/media/' + name
        except Exception as e:
            print('image failed', item_id, e)
        return None

    def save_vid(item_id, url):
        if not url:
            return None
        name = item_id + '.mp4'
        try:
            if download(url, os.path.join(MEDIA, name), MAX_VIDEO):
                keep.add(name)
                return 'ig/media/' + name
        except Exception as e:
            print('video failed', item_id, e)
        return None

    for p in data.get('data', [])[:LIMIT]:
        kind = p.get('media_type')
        children = (p.get('children') or {}).get('data', [])
        post = {
            'id': p['id'], 'url': p.get('permalink'), 'caption': first_line(p.get('caption')),
            'date': (p.get('timestamp') or '')[:10], 'type': kind.lower() if kind else 'image',
        }
        if kind == 'VIDEO':
            post['image'] = save_img(p['id'], p.get('thumbnail_url'))
            post['video'] = save_vid(p['id'], p.get('media_url'))
        elif kind == 'CAROUSEL_ALBUM' and children:
            c0 = children[0]
            post['image'] = save_img(c0['id'], c0.get('thumbnail_url') if c0.get('media_type') == 'VIDEO' else c0.get('media_url'))
            imgs = [c for c in children if c.get('media_type') == 'IMAGE']
            vids = [c for c in children if c.get('media_type') == 'VIDEO']
            if imgs and vids:
                # A poster plus a video in one post: this becomes a gig "moment" card.
                poster = save_img(imgs[0]['id'], imgs[0].get('media_url'))
                video = save_vid(vids[0]['id'], vids[0].get('media_url'))
                vthumb = save_img(vids[0]['id'] + '_t', vids[0].get('thumbnail_url'))
                if poster and video:
                    moments.append(dict(post, poster=poster, video=video, videoThumb=vthumb))
        else:
            post['image'] = save_img(p['id'], p.get('media_url'))
        if post.get('image'):
            posts.append(post)

    # Tidy up media that is no longer in the latest posts.
    for f in os.listdir(MEDIA):
        if f not in keep:
            os.remove(os.path.join(MEDIA, f))

    feed = {'updated': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'profile': 'https://www.instagram.com/putrikamusic/', 'posts': posts, 'moments': moments}
    with open(os.path.join(OUT, 'feed.json'), 'w') as f:
        json.dump(feed, f, ensure_ascii=False, indent=1)
    print(len(posts), 'posts,', len(moments), 'moments')


if __name__ == '__main__':
    main()
