'use strict';

const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.UPLOAD_BUCKET;
const CDN_HOST = process.env.CDN_HOST;
const REGION = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
const URL_EXPIRES = Number(process.env.URL_EXPIRES || 300);

const s3 = new S3Client({ region: REGION });

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event || !event.body) return null;
  if (event.isBase64Encoded) {
    const decoded = Buffer.from(event.body, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }
  return JSON.parse(event.body);
}

function resolvePrefix(contentType) {
  if (!contentType) return null;
  if (contentType.startsWith('image/')) return 'soulscape/image';
  if (contentType.startsWith('video/')) return 'soulscape/video';
  return null;
}

exports.handler = async (event) => {
  if (event.requestContext && event.requestContext.http && event.requestContext.http.method === 'OPTIONS') {
    return json(200, { ok: true });
  }

  let payload;
  try {
    payload = parseBody(event);
  } catch (err) {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const contentType = payload && payload.contentType;
  const originalName = payload && payload.fileName;
  const prefix = resolvePrefix(contentType);

  if (!BUCKET || !CDN_HOST) {
    return json(500, { error: 'Server misconfigured.' });
  }

  if (!contentType || !prefix) {
    return json(400, { error: 'Unsupported contentType. Use image/* or video/*.' });
  }

  const ext = originalName && originalName.includes('.') ? originalName.split('.').pop() : '';
  const name = crypto.randomUUID();
  const key = ext ? `${prefix}/${name}.${ext}` : `${prefix}/${name}`;

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: URL_EXPIRES });
    const cdnUrl = `https://${CDN_HOST}/${key}`;

    return json(200, { uploadUrl, cdnUrl, key, expiresIn: URL_EXPIRES });
  } catch (err) {
    return json(500, { error: 'Failed to create upload URL.' });
  }
};
