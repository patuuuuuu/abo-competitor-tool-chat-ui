import type { ChatMessage } from '@chat-template/core';
import type {
  AnchorHTMLAttributes,
  ComponentType,
  PropsWithChildren,
} from 'react';
import { useState } from 'react';
import { Button } from './ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { Sheet, SheetContent, SheetTitle } from './ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

/**
 * ReactMarkdown/Streamdown component that handles Databricks message citations.
 *
 * @example
 * <Streamdown components={{ a: DatabricksMessageCitationStreamdownIntegration }} />
 */
export const DatabricksMessageCitationStreamdownIntegration: ComponentType<
  AnchorHTMLAttributes<HTMLAnchorElement>
> = (props) => {
  if (isDatabricksMessageCitationLink(props.href)) {
    const payload = decodeDatabricksMessageCitationLink(props.href);
    if (!payload) {
      return <span>{props.children}</span>;
    }

    return (
      <DatabricksMessageCitationRenderer
        {...props}
        href={payload}
      />
    );
  }
  return <DefaultAnchor {...props} />;
};

// const isFootnoteLink

type SourcePart = Extract<ChatMessage['parts'][number], { type: 'source-url' }>;

type EncodedCitationPayload = Pick<
  SourcePart,
  'url' | 'title' | 'providerMetadata' | 'sourceId'
>;

const DATBRICKS_CITATION_PREFIX = '/_databricks_citation_/';

const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeBase64Url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

// Use a relative path instead of a custom URI scheme because Streamdown sanitizes
// unknown protocols and renders them as "[blocked]".
const encodeDatabricksMessageCitationLink = (part: SourcePart) =>
  `${DATBRICKS_CITATION_PREFIX}${encodeBase64Url(
    JSON.stringify({
      sourceId: part.sourceId,
      url: part.url,
      title: part.title,
      providerMetadata: part.providerMetadata,
    } satisfies EncodedCitationPayload),
  )}`;

const decodeDatabricksMessageCitationLink = (
  link: string,
): EncodedCitationPayload | null => {
  try {
    const payload = link.replace(DATBRICKS_CITATION_PREFIX, '');
    const parsed = JSON.parse(decodeBase64Url(payload)) as EncodedCitationPayload;
    if (typeof parsed.url !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

// Creates a markdown link to the Databricks message citation.
export const createDatabricksMessageCitationMarkdown = (part: SourcePart) =>
  `[${part.title || part.url}](${encodeDatabricksMessageCitationLink(part)})`;

// Checks if the link is a Databricks message citation.
const isDatabricksMessageCitationLink = (
  link?: string,
): link is `${typeof DATBRICKS_CITATION_PREFIX}${string}` =>
  link?.startsWith(DATBRICKS_CITATION_PREFIX) ?? false;

const getCitationPageFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const pageParam =
      parsed.searchParams.get('page') ||
      parsed.searchParams.get('pageNumber') ||
      parsed.searchParams.get('page_number') ||
      parsed.searchParams.get('page_num');
    if (pageParam && /^\d+$/.test(pageParam)) {
      return Number.parseInt(pageParam, 10);
    }

    const hash = parsed.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const hashPage =
      hashParams.get('page') ||
      hashParams.get('pageNumber') ||
      hashParams.get('page_number') ||
      hashParams.get('page_num');
    if (hashPage && /^\d+$/.test(hashPage)) {
      return Number.parseInt(hashPage, 10);
    }
  } catch {
    return null;
  }

  return null;
};

const getCitationPageFromMetadata = (
  providerMetadata: SourcePart['providerMetadata'],
) => {
  const candidateKeys = new Set([
    'page',
    'pagenumber',
    'pageindex',
    'pagenum',
    'sourcepage',
    'documentpage',
    'startpage',
  ]);

  const queue: unknown[] = [providerMetadata];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || typeof current !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (
        candidateKeys.has(normalized) &&
        typeof value === 'number' &&
        Number.isFinite(value)
      ) {
        return value > 0 ? value : value + 1;
      }

      if (
        candidateKeys.has(normalized) &&
        typeof value === 'string' &&
        /^\d+$/.test(value)
      ) {
        const page = Number.parseInt(value, 10);
        return page > 0 ? page : page + 1;
      }

      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
};

const getCitationPage = (citation: EncodedCitationPayload) =>
  getCitationPageFromUrl(citation.url) ??
  getCitationPageFromMetadata(citation.providerMetadata);

const isPdfCitation = ({ url, title }: EncodedCitationPayload) => {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.pdf')) {
      return true;
    }
  } catch {
    return title?.toLowerCase().endsWith('.pdf') ?? false;
  }

  return title?.toLowerCase().endsWith('.pdf') ?? false;
};

const getPreviewUrl = (citation: EncodedCitationPayload) => {
  const previewUrl = new URL('/api/citations/content', window.location.origin);
  previewUrl.searchParams.set('url', citation.url);
  if (citation.title) {
    previewUrl.searchParams.set('title', citation.title);
  }

  const page = getCitationPage(citation);
  if (page != null) {
    previewUrl.hash = `page=${page}`;
  }

  return previewUrl.toString();
};

// Renders the Databricks message citation.
const DatabricksMessageCitationRenderer = (
  props: PropsWithChildren<{
    href: EncodedCitationPayload;
  }>,
) => {
  const [open, setOpen] = useState(false);
  const previewable = isPdfCitation(props.href);
  const page = getCitationPage(props.href);
  const previewUrl = previewable ? getPreviewUrl(props.href) : null;
  const debugPayload = JSON.stringify(
    {
      sourceId: props.href.sourceId,
      url: props.href.url,
      title: props.href.title,
      providerMetadata: props.href.providerMetadata ?? null,
    },
    null,
    2,
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <DefaultAnchor
            href={props.href.url}
            onClick={(event) => {
              if (!previewable) {
                return;
              }

              event.preventDefault();
              setOpen(true);
            }}
            target={previewable ? undefined : '_blank'}
            rel={previewable ? undefined : 'noopener noreferrer'}
            className="rounded-md bg-muted-foreground px-2 py-0 text-zinc-200"
          >
            {props.children}
          </DefaultAnchor>
        </TooltipTrigger>
        <TooltipContent
          style={{ maxWidth: '320px', padding: '8px', wordWrap: 'break-word' }}
        >
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{props.href.title || props.href.url}</span>
            {page != null ? <span>Page {page}</span> : null}
            <span className="break-all text-xs text-muted-foreground">
              {props.href.url}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>

      {previewUrl ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="right"
            className="w-[min(96vw,1100px)] gap-3 p-4 sm:max-w-none"
          >
            <div className="flex items-center justify-between gap-3 pr-8">
              <div className="min-w-0">
                <SheetTitle className="truncate">
                  {props.href.title || 'Source document'}
                </SheetTitle>
                {page != null ? (
                  <p className="text-muted-foreground text-sm">Page {page}</p>
                ) : null}
              </div>
              <Button asChild variant="tertiary">
                <a href={props.href.url} target="_blank" rel="noopener noreferrer">
                  Open original
                  <ExternalLink />
                </a>
              </Button>
            </div>
            <iframe
              title={props.href.title || 'Citation preview'}
              src={previewUrl}
              className="h-[calc(100vh-7rem)] w-full rounded-lg border bg-background"
            />
            <Collapsible className="rounded-lg border p-3">
              <CollapsibleTrigger className="text-left text-sm font-medium text-primary">
                Citation payload
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs">
                  {debugPayload}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
};

// Copied from streamdown
// https://github.com/vercel/streamdown/blob/dc5bd12e5709afce09814e47cf80884f8c665b3d/packages/streamdown/lib/components.tsx#L157-L181
const DefaultAnchor: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>> = (
  props,
) => {
  const isIncomplete = props.href === 'streamdown:incomplete-link';
  const isFootnoteLink = props.href?.startsWith('#');

  return (
    <a
      className={cn(
        'wrap-anywhere font-medium text-primary underline',
        props.className,
      )}
      data-incomplete={isIncomplete}
      data-streamdown="link"
      href={props.href}
      {...props}
      {...(isFootnoteLink
        ? {
            target: '_self',
          }
        : {
            target: '_blank',
            rel: 'noopener noreferrer',
          })}
    >
      {props.children}
    </a>
  );
};
