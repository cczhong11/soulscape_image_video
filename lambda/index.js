'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const Jimp = require('jimp');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.UPLOAD_BUCKET;
const CDN_HOST = process.env.CDN_HOST;
const REGION = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
const URL_EXPIRES = Number(process.env.URL_EXPIRES || 300);
const TARGET_BYTES = Number(process.env.TARGET_BYTES || 1000000);
const MAX_BASE64_BYTES = Number(process.env.MAX_BASE64_BYTES || 12000000);

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

function decodeBase64(payload) {
  if (!payload) return null;
  const dataUrlMatch = payload.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
  const base64 = dataUrlMatch ? dataUrlMatch[2] : payload;
  return Buffer.from(base64, 'base64');
}

async function compressImage(buffer, targetBytes) {
  const image = await Jimp.read(buffer);
  const mime = image.getMIME();
  let scale = 1;
  let quality = 80;
  let lastBuffer = buffer;

  for (let i = 0; i < 12; i += 1) {
    const candidate = image.clone();
    if (scale < 1) {
      const width = Math.max(1, Math.round(image.bitmap.width * scale));
      const height = Math.max(1, Math.round(image.bitmap.height * scale));
      candidate.resize(width, height);
    }

    if (mime === Jimp.MIME_JPEG) {
      candidate.quality(quality);
    } else if (mime === Jimp.MIME_PNG) {
      candidate.deflateLevel(9);
    }

    const candidateBuffer = await candidate.getBufferAsync(mime);
    lastBuffer = candidateBuffer;
    if (candidateBuffer.length <= targetBytes) {
      return { buffer: candidateBuffer, mime };
    }

    if (mime === Jimp.MIME_JPEG && quality > 40) {
      quality -= 10;
    } else {
      scale *= 0.85;
      quality = 80;
    }
  }

  return { buffer: lastBuffer, mime };
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
  const folder = payload && payload.folder;
  const imageBase64 = payload && payload.imageBase64;
  const targetBytes = Math.min(Number(payload && payload.targetBytes) || TARGET_BYTES, TARGET_BYTES);
  const prefix = resolvePrefix(contentType);

  if (!BUCKET || !CDN_HOST) {
    return json(500, { error: 'Server misconfigured.' });
  }

  if (!contentType || !prefix) {
    return json(400, { error: 'Unsupported contentType. Use image/* or video/*.' });
  }

  if (!originalName) {
    return json(400, { error: 'fileName is required.' });
  }

  const safeName = originalName
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!safeName) {
    return json(400, { error: 'fileName is invalid.' });
  }

  const folderPath = typeof folder === 'string'
    ? folder
        .split('/')
        .map((segment) =>
          segment
            .replace(/[^A-Za-z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
        )
        .filter(Boolean)
        .join('/')
    : '';

  const key = folderPath ? `${prefix}/${folderPath}/${safeName}` : `${prefix}/${safeName}`;

  try {
    if (imageBase64) {
      const rawBuffer = decodeBase64(imageBase64);
      if (!rawBuffer || rawBuffer.length === 0) {
        return json(400, { error: 'imageBase64 is invalid.' });
      }
      if (rawBuffer.length > MAX_BASE64_BYTES) {
        return json(413, { error: 'Image payload is too large.' });
      }

      const { buffer: compressedBuffer, mime } = await compressImage(rawBuffer, targetBytes);
      const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: mime,
        Body: compressedBuffer
      });
      await s3.send(command);

      const cdnUrl = `https://${CDN_HOST}/${key}`;
      return json(200, {
        cdnUrl,
        key,
        bytes: compressedBuffer.length,
        originalBytes: rawBuffer.length,
        targetBytes
      });
    }

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
