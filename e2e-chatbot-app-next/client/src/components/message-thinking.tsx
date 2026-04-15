import { useState, useEffect, memo } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-react';
import { CodeBlock } from './elements/code-block';
import { Response } from './elements/response';
import type { ToolState } from './elements/tool';

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
}

const AUTO_CLOSE_DELAY = 500;
const MS_IN_S = 1000;

export const MessageThinking = memo(({
  isLoading,
  reasoning,
  toolCalls,
}: MessageThinkingProps) => {
  const isAnyToolRunning = toolCalls.some(
    (t) => t.state === 'input-available' || t.state === 'input-streaming',
  );
  const allToolsDone = toolCalls.length === 0 || toolCalls.every(
    (t) => t.state === 'output-available' || t.state === 'output-error',
  );
  const isStreaming = isLoading && (isAnyToolRunning || !allToolsDone);
  const isDone = !isStreaming && allToolsDone;

  const [isOpen, setIsOpen] = useState(true);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const [startTime] = useState(() => Date.now());
  const [duration, setDuration] = useState(0);

  // Auto-close when done
  useEffect(() => {
    if (isDone && !hasAutoClosed) {
      setDuration(Math.round((Date.now() - startTime) / MS_IN_S));
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isDone, hasAutoClosed, startTime]);

  const triggerLabel = isStreaming
    ? 'Thinking...'
    : duration > 0
      ? `Thought for ${duration}s`
      : 'Thoughts';

  return (
    <Collapsible
      className="not-prose"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger
        className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium transition-colors hover:text-foreground cursor-pointer"
      >
        <ChevronDownIcon
          className={cn(
            'size-3 transition-transform',
            isOpen ? 'rotate-180' : 'rotate-0',
          )}
        />
        {isStreaming ? (
          <span className="animate-pulse">{triggerLabel}</span>
        ) : (
          <span>{triggerLabel}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'mt-2 text-muted-foreground text-sm',
          'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in',
          'border-l pl-4 border-border',
        )}
      >
        <div className="space-y-3">
          {reasoning && (
            <div className="text-muted-foreground">
              <Response className="grid gap-2">{reasoning}</Response>
            </div>
          )}
          {toolCalls.map((tool, i) => (
            <div key={i} className="space-y-1">
              <span className="text-xs font-medium">
                {tool.state === 'input-available' || tool.state === 'input-streaming'
                  ? `Searching ${tool.toolName}...`
                  : `Used ${tool.toolName}`}
              </span>
              <div className="rounded-md bg-muted/50">
                <CodeBlock code={JSON.stringify(tool.input, null, 2)} language="json" />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

MessageThinking.displayName = 'MessageThinking';