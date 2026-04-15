import React, { memo, useState, useMemo } from 'react';
import { Response } from './elements/response';
import { MessageContent } from './elements/message';
import {
  ToolOutput,
  type ToolState,
} from './elements/tool';
import {
  McpTool,
  McpToolHeader,
  McpToolContent,
  McpToolInput,
  McpApprovalActions,
} from './elements/mcp-tool';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import equal from 'fast-deep-equal';
import { cn, sanitizeText } from '@/lib/utils';
import { MessageEditor } from './message-editor';
import { MessageThinking, type ToolCallInfo } from './message-thinking';
import { Shimmer } from './ui/shimmer';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage, Feedback } from '@chat-template/core';
import { useDataStream } from './data-stream-provider';
import {
  createMessagePartSegments,
  isNamePart,
  joinMessagePartSegments,
} from './databricks-message-part-transformers';
import { createDatabricksMessageCitationMarkdown } from './databricks-message-citation';
import { MessageError } from './message-error';
import { MessageOAuthError } from './message-oauth-error';
import { isCredentialErrorMessage } from '@/lib/oauth-error-utils';
import { useApproval } from '@/hooks/use-approval';

const PurePreviewMessage = ({
  message,
  allMessages,
  isLoading,
  setMessages,
  addToolApprovalResponse,
  sendMessage,
  regenerate,
  isReadonly,
  requiresScrollPadding,
  initialFeedback,
}: {
  message: ChatMessage;
  allMessages: ChatMessage[];
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>['addToolApprovalResponse'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  initialFeedback?: Feedback;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [showErrors, setShowErrors] = useState(false);

  // Hook for handling MCP approval requests
  const { submitApproval, isSubmitting, pendingApprovalId } = useApproval({
    addToolApprovalResponse,
    sendMessage,
  });

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === 'file',
  );

  // Extract non-OAuth error parts separately (OAuth errors are rendered inline)
  const errorParts = React.useMemo(
    () =>
      message.parts
        .filter((part) => part.type === 'data-error')
        .filter((part) => {
          // OAuth errors are rendered inline, not in the error section
          return !isCredentialErrorMessage(part.data);
        }),
    [message.parts],
  );

  useDataStream();

  const partSegments = React.useMemo(
    /**
     * We segment message parts into segments that can be rendered as a single component.
     * Used to render citations as part of the associated text.
     * Note: OAuth errors are included here for inline rendering, non-OAuth errors are filtered out.
     */
    () =>
      createMessagePartSegments(
        message.parts.filter(
          (part) =>
            part.type !== 'data-error' || isCredentialErrorMessage(part.data),
        ),
      ),
    [message.parts],
  );
  // Pre-compute starting citation number for each segment
  // so citations are numbered sequentially across the entire message
  const citationStartNumbers = useMemo(() => {
    const starts: number[] = [];
    let counter = 1;
    for (const segment of partSegments) {
      starts.push(counter);
      counter += segment.filter((p) => p.type === 'source-url').length;
    }
    return starts;
  }, [partSegments]);

  const {
    lastNameIndex,
    childSegments,
    supervisorSegments,
    childCitationStartNumbers,
  } = useMemo(() => {
    const index = partSegments.findLastIndex((segment) =>
      isNamePart(segment[0]),
    );

    if (index >= 0) {
      return {
        lastNameIndex: index,
        childSegments: partSegments.slice(0, index),
        supervisorSegments: partSegments.slice(index),
        childCitationStartNumbers: citationStartNumbers.slice(0, index),
      };
    }

    return {
      lastNameIndex: -1,
      childSegments: [] as ChatMessage['parts'][],
      supervisorSegments: partSegments,
      childCitationStartNumbers: [] as number[],
    };
  }, [partSegments, citationStartNumbers]);

  // Pre-collect all thinking data (reasoning + tool calls + child responses)
  const thinkingData = useMemo(() => {
    const reasoningText = message.parts
      .filter((p) => p.type === 'reasoning')
      .map((p) => {
        const text = (p as any).text as string | undefined;
        return text?.trim() ? text : '';
      })
      .filter(Boolean)
      .join('\n');

    const toolCalls: ToolCallInfo[] = message.parts
      .filter(
        (p) =>
          p.type === 'dynamic-tool' &&
          !(p as any).callProviderMetadata?.databricks?.approvalRequestId,
      )
      .map((p) => {
        const part = p as any;
        const effectiveState =
          part.providerExecuted && !isLoading && part.state === 'input-available'
            ? ('output-available' as const)
            : part.state;
        return {
          toolName: part.toolName,
          state: effectiveState,
          input: part.input,
          output: part.output,
          errorText: part.errorText,
        };
      });

    return {
      reasoning: reasoningText || undefined,
      toolCalls,
      childSegments,
      childCitationStartNumbers,
      hasContent:
        !!reasoningText || toolCalls.length > 0 || childSegments.length > 0,
    };
  }, [message.parts, isLoading, childSegments, childCitationStartNumbers]);

  // Check if message only contains non-OAuth errors (no other content)
  const hasOnlyErrors = React.useMemo(() => {
    const nonErrorParts = message.parts.filter(
      (part) => part.type !== 'data-error',
    );
    // Only consider non-OAuth errors for this check
    return errorParts.length > 0 && nonErrorParts.length === 0;
  }, [message.parts, errorParts.length]);

  return (
    <div
      data-testid={`message-${message.role}`}
      className="group/message w-full"
      data-role={message.role}
    >
      <div
        className={cn('flex w-full items-start gap-2 md:gap-3', {
          'justify-end': message.role === 'user',
          'justify-start': message.role === 'assistant',
        })}
      >
        {partSegments.length === 0 && errorParts.length === 0 && message.role === 'assistant' && (
          <AwaitingResponseMessage />
        )}

        <div
          className={cn('flex min-w-0 flex-col gap-3', {
            'w-full': message.role === 'assistant' || mode === 'edit',
            'min-h-96': message.role === 'assistant' && requiresScrollPadding,
            'max-w-[70%] sm:max-w-[min(fit-content,80%)]':
              message.role === 'user' && mode !== 'edit',
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              data-testid={`message-attachments`}
              className={cn('flex flex-row justify-end gap-2', {
                'justify-start': message.role === 'assistant',
              })}
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  key={attachment.url}
                  attachment={{
                    name: attachment.filename ?? 'file',
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                />
              ))}
            </div>
          )}
          {thinkingData.hasContent && (
            <MessageThinking
              isLoading={isLoading}
              reasoning={thinkingData.reasoning}
              toolCalls={thinkingData.toolCalls}
              childSegments={thinkingData.childSegments}
              childCitationStartNumbers={thinkingData.childCitationStartNumbers}
            />
          )}

          {supervisorSegments?.map((parts, supervisorIndex) => {
            const index =
              lastNameIndex >= 0
                ? lastNameIndex + supervisorIndex
                : supervisorIndex;
            const [part] = parts;
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === 'reasoning' && part.text?.trim().length > 0) {
              // Handled by unified MessageThinking block above
              return null;
            }

            if (type === 'text') {
              if (isNamePart(part)) {
                return null;
              }
              if (mode === 'view') {
                return (
                  <div key={key}>
                    <MessageContent
                      data-testid="message-content"
                      className={cn({
                        'w-fit break-words rounded-2xl bg-secondary px-3 py-2 text-left text-base':
                          message.role === 'user',
                        'bg-transparent px-0 py-0 text-left text-base':
                          message.role === 'assistant',
                      })}
                    >
                      <Response>
                        {sanitizeText(joinMessagePartSegments(parts, citationStartNumbers[index]))}
                      </Response>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === 'edit') {
                return (
                  <div
                    key={key}
                    className="flex w-full flex-row items-start gap-3"
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        regenerate={regenerate}
                      />
                    </div>
                  </div>
                );
              }
            }

            // Render Databricks tool calls and results
            if (part.type === `dynamic-tool`) {
              const { toolCallId, input, state, errorText, output, toolName } =
                part;

              const isMcpApproval =
                part.callProviderMetadata?.databricks?.approvalRequestId !=
                null;
              const mcpServerName =
                part.callProviderMetadata?.databricks?.mcpServerName?.toString();

              const approved: boolean | undefined =
                'approval' in part ? part.approval?.approved : undefined;

              const effectiveState: ToolState = (() => {
                if (
                  part.providerExecuted &&
                  !isLoading &&
                  state === 'input-available'
                ) {
                  return 'output-available';
                }
                return state;
              })();

              // Render MCP tool calls with special styling
              if (isMcpApproval) {
                return (
                  <McpTool key={toolCallId} defaultOpen={true}>
                    <McpToolHeader
                      serverName={mcpServerName}
                      toolName={toolName}
                      state={effectiveState}
                      approved={approved}
                    />
                    <McpToolContent>
                      <McpToolInput input={input} />
                      {state === 'approval-requested' && (
                        <McpApprovalActions
                          onApprove={() =>
                            submitApproval({
                              approvalRequestId: toolCallId,
                              approve: true,
                            })
                          }
                          onDeny={() =>
                            submitApproval({
                              approvalRequestId: toolCallId,
                              approve: false,
                            })
                          }
                          isSubmitting={
                            isSubmitting && pendingApprovalId === toolCallId
                          }
                        />
                      )}
                      {state === 'output-available' && output != null && (
                        <ToolOutput
                          output={
                            errorText ? (
                              <div className="rounded border p-2 text-red-500">
                                Error: {errorText}
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap font-mono text-sm">
                                {typeof output === 'string'
                                  ? output
                                  : JSON.stringify(output, null, 2)}
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </McpToolContent>
                  </McpTool>
                );
              }

              // Regular tool calls - handled by unified thinking block
              return null;
            }

            // Support for citations/annotations
            if (type === 'source-url') {
              return (
                <Response key={key}>
                  {createDatabricksMessageCitationMarkdown(part)}
                </Response>
              );
            }

            // Render OAuth errors inline
            if (type === 'data-error' && isCredentialErrorMessage(part.data)) {
              return (
                <MessageOAuthError
                  key={key}
                  error={part.data}
                  allMessages={allMessages}
                  setMessages={setMessages}
                  sendMessage={sendMessage}
                />
              );
            }
          })}

          {!isReadonly && !hasOnlyErrors && (
            <MessageActions
              key={`action-${message.id}`}
              message={message}
              isLoading={isLoading}
              setMode={setMode}
              errorCount={errorParts.length}
              showErrors={showErrors}
              onToggleErrors={() => setShowErrors(!showErrors)}
              initialFeedback={initialFeedback}
            />
          )}

          {errorParts.length > 0 && (hasOnlyErrors || showErrors) && (
            <div className="flex flex-col gap-2">
              {errorParts.map((part, index) => (
                <MessageError
                  key={`error-${message.id}-${index}`}
                  error={part.data}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    // While streaming, re-render whenever the AI SDK produces a new message
    // object (each throttled update). We use reference equality rather than
    // deep-equal on parts because fast-deep-equal short-circuits on identical
    // references — and the SDK may mutate parts in place during streaming.
    if (nextProps.isLoading && prevProps.message !== nextProps.message)
      return false;

    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (prevProps.initialFeedback?.feedbackType !== nextProps.initialFeedback?.feedbackType)
      return false;

    return true; // Props are equal, skip re-render
  },
);

export const AwaitingResponseMessage = () => {
  const role = 'assistant';

  return (
    <div
      data-testid="message-assistant-loading"
      className="group/message w-full"
      data-role={role}
    >
      <div className="flex items-start justify-start gap-3">
        <Shimmer className="flex items-center">Generating response</Shimmer>
      </div>
    </div>
  );
};
