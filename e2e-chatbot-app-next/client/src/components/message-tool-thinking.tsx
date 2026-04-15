import { useState, useEffect, memo } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-react';
import { CodeBlock } from './elements/code-block';
import type { ToolState } from './elements/tool';

interface MessageToolThinkingProps {
  toolName: string;
  state: ToolState;
  input: unknown;
  output?: unknown;
  errorText?: string;
  isLoading: boolean;
}

const AUTO_CLOSE_DELAY = 500;
const MS_IN_S = 1000;

export const MessageToolThinking = memo(({
  toolName,
  state,
  input,
  output,
  errorText,
  isLoading,
}: MessageToolThinkingProps) => {
  const isRunning = state === 'input-available' || state === 'input-streaming';
  const isCompleted = state === 'output-available';
  const isError = state === 'output-error';

  const [isOpen, setIsOpen] = useState(true);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const [startTime] = useState(() => Date.now());
  const [duration, setDuration] = useState(0);

  // Track duration and auto-close when completed
  useEffect(() => {
    if ((isCompleted || isError) && !hasAutoClosed) {
      setDuration(Math.round((Date.now() - startTime) / MS_IN_S));
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, isError, hasAutoClosed, startTime]);

  const triggerLabel = isRunning
    ? `Searching ${toolName}...`
    : isError
      ? `${toolName} failed`
      : duration > 0
        ? `Used ${toolName} (${duration}s)`
        : `Used ${toolName}`;

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
        {isRunning ? (
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
        <div className="space-y-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Parameters
          </h4>
          <div className="rounded-md bg-muted/50">
            <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
          </div>
          {(isCompleted || isError) && (output != null || errorText) && (
            <>
              <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {errorText ? 'Error' : 'Result'}
              </h4>
              <div className={cn(
                'whitespace-pre-wrap font-mono text-xs rounded-md p-2',
                errorText ? 'bg-destructive/10 text-destructive' : 'bg-muted/50',
              )}>
                {errorText
                  ? errorText
                  : typeof output === 'string'
                    ? output
                    : JSON.stringify(output, null, 2)}
              </div>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

MessageToolThinking.displayName = 'MessageToolThinking';