'use strict';

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const BUCKET = process.env.UPLOAD_BUCKET;
const CDN_HOST = process.env.CDN_HOST;
const REGION = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
const MAX_KEYS = Number(process.env.MAX_KEYS || 200);

const s3 = new S3Client({ region: REGION });

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function buildPrefix(type) {
  if (type === 'image') return 'soulscape/image/';
  if (type === 'video') return 'soulscape/video/';
  return null;
}

exports.handler = async (event) => {
  if (event.requestContext && event.requestContext.http && event.requestContext.http.method === 'OPTIONS') {
    return json(200, { ok: true });
  }

  if (!BUCKET || !CDN_HOST) {
    return json(500, { error: 'Server misconfigured.' });
  }

  const params = event.queryStringParameters || {};
  const type = (params.type || '').toLowerCase();
  const prefix = buildPrefix(type);

  if (!prefix) {
    return json(400, { error: 'type must be image or video.' });
  }

  const continuationToken = params.cursor || undefined;

  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: MAX_KEYS
    });

    const response = await s3.send(command);
    const items = (response.Contents || [])
      .filter((obj) => obj && obj.Key && obj.Size > 0 && !obj.Key.endsWith('/'))
      .map((obj) => ({
        key: obj.Key,
        cdnUrl: `https://${CDN_HOST}/${obj.Key}`,
        lastModified: obj.LastModified,
        size: obj.Size
      }));

    return json(200, {
      items,
      nextToken: response.IsTruncated ? response.NextContinuationToken : null
    });
  } catch (err) {
    return json(500, { error: 'Failed to list objects.' });
  }
};
