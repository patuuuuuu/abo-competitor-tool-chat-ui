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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendPreviewErrorHtml = ({
  res,
  title,
  url,
  detail,
}: {
  res: Response;
  title: string | null;
  url: string;
  detail?: string | null;
}) => {
  const safeTitle = escapeHtml(title || 'Source document');
  const safeUrl = escapeHtml(url);
  const safeDetail = detail ? escapeHtml(detail) : null;

  return res.status(200).type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, system-ui, sans-serif;
      }
      body {
        margin: 0;
        background: #f8fafc;
        color: #0f172a;
      }
      main {
        max-width: 720px;
        margin: 48px auto;
        padding: 24px;
      }
      .card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.25rem;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.5;
      }
      code {
        display: block;
        overflow-wrap: anywhere;
        padding: 12px;
        border-radius: 10px;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        font-size: 0.875rem;
      }
      a {
        display: inline-block;
        margin-top: 8px;
        color: #0f766e;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>Preview unavailable</h1>
        <p>The citation opened, but Databricks could not retrieve the underlying file for inline preview.</p>
        ${safeDetail ? `<p>${safeDetail}</p>` : ''}
        <p>Original source:</p>
        <code>${safeUrl}</code>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open original source</a>
      </div>
    </main>
  </body>
</html>`);
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

const getBearerTokenFromAuthorization = (authorizationHeader?: string) => {
  if (!authorizationHeader) {
    return undefined;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
};

const normalizeCitationUrl = (citationUrl: URL) => {
  const normalized = new URL(citationUrl.toString());

  // Databricks agent citations can return browser-facing ajax-api URLs.
  // Those are not reliable for server-side fetches; switch to the canonical REST path.
  if (normalized.pathname.startsWith('/ajax-api/2.0/fs/files/')) {
    normalized.pathname = normalized.pathname.replace(
      '/ajax-api/2.0/fs/files/',
      '/api/2.0/fs/files/',
    );
  }

  return normalized;
};

const isPdfLikeCitation = (citationUrl: URL, rawTitle: string | null) => {
  const pathname = citationUrl.pathname.toLowerCase();
  if (pathname.endsWith('.pdf')) {
    return true;
  }

  return rawTitle?.toLowerCase().endsWith('.pdf') ?? false;
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

    const citationUrl = normalizeCitationUrl(new URL(rawUrl));
    const workspaceHost = new URL(await getWorkspaceHostname()).hostname;

    if (!isTrustedCitationUrl(citationUrl, workspaceHost)) {
      return res.status(400).json({
        error: 'Untrusted citation URL',
      });
    }

    const headers = new Headers();
    const forwardedUserToken = req.headers[
      'x-forwarded-access-token'
    ] as string | undefined;
    const authorizationBearerToken = getBearerTokenFromAuthorization(
      req.headers.authorization,
    );

    console.log(
      '[citations] Preview request:',
      JSON.stringify({
        userId: req.session?.user.id ?? null,
        title: typeof rawTitle === 'string' ? rawTitle : null,
        hostname: citationUrl.hostname,
        pathname: citationUrl.pathname,
        hasForwardedAccessToken: Boolean(forwardedUserToken),
        hasAuthorizationBearer: Boolean(authorizationBearerToken),
      }),
    );

    if (citationUrl.hostname === workspaceHost) {
      const token =
        forwardedUserToken ||
        authorizationBearerToken ||
        (await getDatabricksToken());
      headers.set('Authorization', `Bearer ${token}`);
    }

    const upstream = await fetch(citationUrl, { headers });
    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.warn(
        '[citations] Upstream preview request failed:',
        JSON.stringify({
          status: upstream.status,
          statusText: upstream.statusText,
          hostname: citationUrl.hostname,
          pathname: citationUrl.pathname,
          bodySnippet: errorText.slice(0, 500),
        }),
      );
      return sendPreviewErrorHtml({
        res,
        title: typeof rawTitle === 'string' ? rawTitle : null,
        url: citationUrl.toString(),
        detail:
          upstream.status === 404
            ? 'The referenced file was not found. This usually means the citation points to a stale or no-longer-accessible workspace file.'
            : `Preview request failed with status ${upstream.status}.`,
      });
    }

    const contentType = isPdfLikeCitation(
      citationUrl,
      typeof rawTitle === 'string' ? rawTitle : null,
    )
      ? 'application/pdf'
      : upstream.headers.get('content-type') || 'application/octet-stream';
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
    return sendPreviewErrorHtml({
      res,
      title: typeof req.query.title === 'string' ? req.query.title : null,
      url: typeof req.query.url === 'string' ? req.query.url : '',
      detail: 'The preview request failed before the document could be loaded.',
    });
  }
});
