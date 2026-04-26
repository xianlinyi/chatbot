import type { RefObject } from "react";
import type { ChatDisplayEvent, ChatMessage } from "../types.js";
import { ContentRenderer } from "./ContentRenderer";
import { CheckIcon, CopyIcon } from "./icons.js";

type MessageListProps = {
  answeredInputRequestIds: ReadonlySet<string>;
  bottomRef: RefObject<HTMLDivElement | null>;
  copiedMessageId: string | null;
  expandedUserMessages: Record<string, boolean>;
  isDarkMode: boolean;
  messages: ChatMessage[];
  onAnimationDone: (messageId: string) => void;
  onChoiceSelect: (requestId: string, choice: string, wasFreeform?: boolean) => void;
  onCopy: (content: string, messageId: string) => void;
  onToggleUserMessageExpansion: (messageId: string) => void;
  overflowingUserMessages: Record<string, boolean>;
  userMessageBodyRefs: RefObject<Record<string, HTMLDivElement | null>>;
};

export function MessageList({
  answeredInputRequestIds,
  bottomRef,
  copiedMessageId,
  expandedUserMessages,
  isDarkMode,
  messages,
  onAnimationDone,
  onChoiceSelect,
  onCopy,
  onToggleUserMessageExpansion,
  overflowingUserMessages,
  userMessageBodyRefs
}: MessageListProps) {
  return (
    <section className="conversation" aria-label="Conversation">
      <div className="message-list">
        {messages.map((message) => (
          <article
            className={`message ${message.role} ${message.isNew ? "message-enter" : ""}`}
            key={message.id}
            onAnimationEnd={() => {
              if (message.isNew) {
                onAnimationDone(message.id);
              }
            }}
          >
            <div className="message-inner">
              <div className="message-header">
                <div className="message-meta"></div>
              </div>
              {message.role === "user" ? (
                <div
                  className={`user-message-card ${expandedUserMessages[message.id] ? "expanded" : "collapsed"} ${overflowingUserMessages[message.id] ? "overflowing" : ""}`}
                >
                  <div className="user-message-clip">
                    <div
                      className="message-content user-message-body"
                      ref={(element) => {
                        userMessageBodyRefs.current[message.id] = element;
                      }}
                    >
                      {message.content ? <MessageContent content={message.content} isDarkMode={isDarkMode} /> : null}
                    </div>
                  </div>
                  {overflowingUserMessages[message.id] ? (
                    <button
                      className="user-message-toggle"
                      type="button"
                      onClick={() => onToggleUserMessageExpansion(message.id)}
                    >
                      {expandedUserMessages[message.id] ? "收起" : "展开全部"}
                    </button>
                  ) : null}
                </div>
              ) : (
                message.content || message.events?.length ? (
                  <MarkdownMessageContent
                    content={message.content}
                    events={message.events}
                    onChoiceSelect={onChoiceSelect}
                    answeredInputRequestIds={answeredInputRequestIds}
                  />
                ) : null
              )}
              {message.content && (
                <button
                  className="copy-button"
                  onClick={() => onCopy(message.content, message.id)}
                  aria-label={copiedMessageId === message.id ? "Copied!" : "Copy message"}
                  title={copiedMessageId === message.id ? "已复制" : "复制"}
                >
                  {copiedMessageId === message.id ? <CheckIcon /> : <CopyIcon />}
                </button>
              )}
            </div>
          </article>
        ))}
        <div className="chat-spacer" ref={bottomRef} />
      </div>
    </section>
  );
}

function MessageContent({ content, isDarkMode }: { content: string; isDarkMode: boolean }) {
  void isDarkMode;
  return <div className="raw-message-content">{content}</div>;
}

function MarkdownMessageContent({
  content,
  events,
  onChoiceSelect,
  answeredInputRequestIds
}: {
  content: string;
  events?: ChatDisplayEvent[];
  onChoiceSelect?: (requestId: string, choice: string, wasFreeform?: boolean) => void;
  answeredInputRequestIds?: ReadonlySet<string>;
}) {
  return (
    <ContentRenderer
      content={content}
      events={events}
      onChoiceSelect={onChoiceSelect}
      answeredInputRequestIds={answeredInputRequestIds}
    />
  );
}
