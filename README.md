# Soulscape Image/Video Upload

## What was created
- Lambda `soulscape-upload` generates pre-signed S3 upload URLs and returns a CloudFront URL.
- Lambda `soulscape-list` lists objects under `soulscape/image` or `soulscape/video` and returns CloudFront URLs.
- HTTP API Gateway endpoint: `https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/upload`
- Static UI in `docs/` for GitHub Pages.

## Expected request body
```json
{
  "fileName": "clip.mp4",
  "contentType": "video/mp4",
  "folder": "campaign-01/hero"
}
```

## API
`POST https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/upload`

Example:
```bash
curl -s -X POST https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/upload \
  -H 'Content-Type: application/json' \
  -d '{"fileName":"clip.mp4","contentType":"video/mp4"}'
```

`GET https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/list?type=image`

`GET https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/list?type=video`

## Notes
- Bucket: `cai2025`
- Prefixes: `soulscape/image/` and `soulscape/video/`
- CDN: `d33e382l66m7o1.cloudfront.net`
- File names are preserved (sanitized) instead of using UUIDs.

## S3 CORS
The CLI user didn’t have permission to set bucket CORS. If uploads fail in the browser, apply:
```
aws s3api put-bucket-cors --bucket cai2025 --cors-configuration file://s3-cors.json
```

## GitHub Pages
Publish the `docs/` folder (Settings → Pages → Source: Deploy from a branch, /docs).
