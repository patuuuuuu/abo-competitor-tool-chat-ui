import { useState, useEffect, memo } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { cn, sanitizeText } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-react';
import { CodeBlock } from './elements/code-block';
import { Response } from './elements/response';
import { MessageContent } from './elements/message';
import type { ToolState } from './elements/tool';
import type { ChatMessage } from '@chat-template/core';
import { createDatabricksMessageCitationMarkdown } from './databricks-message-citation';
import {
  isNamePart,
  formatNamePart,
  getAgentDisplayName,
  joinMessagePartSegments,
} from './databricks-message-part-transformers';

export interface ToolCallInfo {
  toolName: string;
  state: ToolState;
  input: unknown;
  output?: unknown;
  errorText?: string;
}

interface MessageThinkingProps {
  isLoading: boolean;
  reasoning?: string;
  toolCalls: ToolCallInfo[];
  childSegments?: ChatMessage['parts'][];
  childCitationStartNumbers?: number[];
}

const MS_IN_S = 1000;

export const MessageThinking = memo(
  ({
    isLoading,
    reasoning,
    toolCalls,
    childSegments,
    childCitationStartNumbers,
  }: MessageThinkingProps) => {
    const isAnyToolRunning = toolCalls.some(
      (t) => t.state === 'input-available' || t.state === 'input-streaming',
    );
    const allToolsDone =
      toolCalls.length === 0 ||
      toolCalls.every(
        (t) => t.state === 'output-available' || t.state === 'output-error',
      );
    const isStreaming = isLoading && (isAnyToolRunning || !allToolsDone);
    const isDone = !isStreaming && allToolsDone;

    const [isOpen, setIsOpen] = useState(false);
    const [startTime] = useState(() => Date.now());
    const [duration, setDuration] = useState(0);

    useEffect(() => {
      if (isDone) {
        setDuration(Math.round((Date.now() - startTime) / MS_IN_S));
      }
    }, [isDone, startTime]);

    return (
      <Collapsible className="not-prose" open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex cursor-pointer flex-col items-start gap-0.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground">
          <div className="flex items-center gap-1.5">
            <ChevronDownIcon
              className={cn(
                'size-3 transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0',
              )}
            />
            {isStreaming ? (
              <span className="animate-pulse">Thinking...</span>
            ) : (
              <span>{duration > 0 ? `Thought for ${duration}s` : 'Thoughts'}</span>
            )}
          </div>
          <span className="pl-[18px] font-normal text-muted-foreground/70 text-xs">
            {isStreaming
              ? 'Click here to see the thinking process and the answer as it is generated.'
              : 'Click here to expand the thinking process and the source answers.'}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            'mt-2 text-muted-foreground text-sm',
            'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in',
            'border-border border-l pl-4',
          )}
        >
          <div className="space-y-3">
            {reasoning && (
              <div className="text-muted-foreground">
                <Response className="grid gap-2">{reasoning}</Response>
              </div>
            )}
            {toolCalls.map((tool) => {
              const toolKey = `${tool.toolName}-${tool.state}-${JSON.stringify(tool.input)}`;
              return (
                <div key={toolKey} className="space-y-1">
                  <span className="font-medium text-xs">
                    {tool.state === 'input-available' ||
                    tool.state === 'input-streaming'
                      ? `Searching ${tool.toolName}...`
                      : `Used ${tool.toolName}`}
                  </span>
                  <div className="rounded-md bg-muted/50">
                    <CodeBlock
                      code={JSON.stringify(tool.input, null, 2)}
                      language="json"
                    />
                  </div>
                </div>
              );
            })}
            {childSegments?.map((parts, index) => {
              const [part] = parts;
              const partKey =
                part.type === 'text'
                  ? part.text ?? 'text'
                  : part.type === 'source-url'
                    ? `${part.url}-${part.title ?? ''}`
                    : part.type;

              if (isNamePart(part)) {
                const displayName = getAgentDisplayName(
                  formatNamePart(part) ?? '',
                  false,
                );
                return (
                  <h4
                    key={`child-name-${partKey}`}
                    className="mt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  >
                    {displayName}
                  </h4>
                );
              }

              if (part.type === 'text') {
                return (
                  <MessageContent
                    key={`child-text-${partKey}`}
                    className="text-muted-foreground"
                  >
                    <Response>
                      {sanitizeText(
                        joinMessagePartSegments(
                          parts,
                          childCitationStartNumbers?.[index],
                        ),
                      )}
                    </Response>
                  </MessageContent>
                );
              }

              if (part.type === 'source-url') {
                return (
                  <Response key={`child-cite-${partKey}`}>
                    {createDatabricksMessageCitationMarkdown(part)}
                  </Response>
                );
              }

              return null;
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  },
);

MessageThinking.displayName = 'MessageThinking';
