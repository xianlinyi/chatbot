const fs = require('fs');

let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

// Replace the message-content structure
const oldLayout = `                  <div className="message-content">
                    {message.status === "streaming" ? <ThinkingTitle /> : null}
                    {message.content ? (
                      <MessageContent content={message.content} isDarkMode={isDarkMode} />
                    ) : (
                      null
                    )}
                    <AssistantToolActivity activities={message.activities ?? []} />
                    <AssistantInputRequests requests={message.inputRequests ?? []} />
                    {message.status !== "streaming" && message.usage ? (
                      <div className="message-usage">{formatUsage(message.usage)}</div>
                    ) : null}
                  </div>`;

const newLayout = `                  <div className="message-content">
                    {message.content ? (
                      <MessageContent content={message.content} isDarkMode={isDarkMode} />
                    ) : (
                      null
                    )}
                    <AssistantToolActivity activities={message.activities ?? []} />
                    <AssistantInputRequests requests={message.inputRequests ?? []} />
                    {message.status === "streaming" ? <ThinkingTitle /> : null}
                    {message.status !== "streaming" && message.usage ? (
                      <div className="message-usage">{formatUsage(message.usage)}</div>
                    ) : null}
                  </div>`;

content = content.replace(oldLayout, newLayout);

// Also remove the "hasRunning" thinking dots I added inside AssistantToolActivity earlier,
// so that there's only ONE thinking animation at the bottom (Testing if they just meant the ThinkingTitle)
const oldToolActivity = `      )}
      {hasRunning && (
        <div className="tool-event info" style={{ paddingBottom: '4px' }}>
          <div className="tool-event-title">
            <span className="thinking-dots tool-event-dots" style={{ marginLeft: 0 }} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      )}
    </section>`;

const newToolActivity = `      )}
    </section>`;

content = content.replace(oldToolActivity, newToolActivity);

fs.writeFileSync('client/src/App.tsx', content);
