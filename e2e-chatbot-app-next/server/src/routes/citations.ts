import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { getDatabricksToken } from '@chat-template/auth';
import { getWorkspaceHostname } from '@chat-template/ai-sdk-providers';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { ChatSDKError } from '@chat-template/core/errors';

export const citationsRouter: RouterType = Router();

citationsRouter.use(authMiddleware);

const TRUSTED_STORAGE_HOST_SUFFIXES = [
  '.amazonaws.com',
  '.blob.core.windows.net',
  '.cloudfront.net',
  '.dfs.core.windows.net',
  '.googleapis.com',
  '.r2.cloudflarestorage.com',
  '.storage.googleapis.com',
];

const SIGNED_URL_QUERY_KEYS = [
  'GoogleAccessId',
  'Signature',
  'X-Amz-Signature',
  'sig',
  'sv',
];

const isPrivateHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    const octets = normalized.split('.').map((part) => Number.parseInt(part, 10));
    if (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    ) {
      return true;
    }
  }

  return false;
};

const toInlineFilename = (rawTitle: string | null) => {
  const fallback = 'citation.pdf';
  if (!rawTitle) {
    return fallback;
  }

  const sanitized = rawTitle
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return fallback;
  }

  return sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
};

const isTrustedCitationUrl = (url: URL, workspaceHost: string) => {
  if (url.protocol !== 'https:') {
    return false;
  }

  if (isPrivateHostname(url.hostname)) {
    return false;
  }

  if (url.hostname === workspaceHost) {
    return true;
  }

  if (
    TRUSTED_STORAGE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  ) {
    return true;
  }

  return SIGNED_URL_QUERY_KEYS.some((key) => url.searchParams.has(key));
};

citationsRouter.get('/content', requireAuth, async (req: Request, res: Response) => {
  try {
    const rawUrl = req.query.url;
    const rawTitle = req.query.title;

    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      const error = new ChatSDKError('bad_request:api');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    const citationUrl = new URL(rawUrl);
    const workspaceHost = new URL(await getWorkspaceHostname()).hostname;

    if (!isTrustedCitationUrl(citationUrl, workspaceHost)) {
      return res.status(400).json({
        error: 'Untrusted citation URL',
      });
    }

    const headers = new Headers();
    if (citationUrl.hostname === workspaceHost) {
      const userToken = req.headers['x-forwarded-access-token'] as string | undefined;
      const token = userToken || (await getDatabricksToken());
      headers.set('Authorization', `Bearer ${token}`);
    }

    const upstream = await fetch(citationUrl, { headers });
    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).send(errorText);
    }

    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${toInlineFilename(typeof rawTitle === 'string' ? rawTitle : null)}"`,
    );

    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    }

    const lastModified = upstream.headers.get('last-modified');
    if (lastModified) {
      res.setHeader('Last-Modified', lastModified);
    }

    const etag = upstream.headers.get('etag');
    if (etag) {
      res.setHeader('ETag', etag);
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).end(body);
  } catch (error) {
    console.error('[citations] Failed to proxy citation preview:', error);
    const chatError = new ChatSDKError('offline:chat');
    const response = chatError.toResponse();
    return res.status(response.status).json(response.json);
  }
});
