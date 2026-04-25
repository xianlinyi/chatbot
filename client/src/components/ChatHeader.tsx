import type { AgentInfoResponse } from "../types.js";
import { MoonIcon, SunIcon } from "./icons.js";

type ChatHeaderProps = {
  agentInfo: AgentInfoResponse | undefined;
  isWelcomeMode: boolean;
  isDarkMode: boolean;
  onDarkModeChange: (isDarkMode: boolean) => void;
  subtitle: string;
};

export function ChatHeader({ agentInfo, isWelcomeMode, isDarkMode, onDarkModeChange, subtitle }: ChatHeaderProps) {
  return (
    <header className={`shell-header ${isWelcomeMode ? "welcome" : "chat-active"}`} aria-label="Chat controls">
      <div className="header-agent-info">
        <div className="header-agent-name">{agentInfo?.app.name ?? "Agent"}</div>
        <div className="header-agent-meta">
          <span>{subtitle}</span>
          {(agentInfo?.agent.skillDirectories?.length ?? 0) > 0 ? (
            <span>{agentInfo?.agent.skillDirectories?.length} Skills</span>
          ) : null}
          {agentInfo?.agent.instructions ? <span>Instructions</span> : null}
        </div>
      </div>
      <label className="theme-toggle-switch" aria-label="Toggle dark mode">
        <input
          type="checkbox"
          checked={isDarkMode}
          onChange={() => onDarkModeChange(!isDarkMode)}
        />
        <span className="slider">
          <span className="slider-icon sun"><SunIcon /></span>
          <span className="slider-icon moon"><MoonIcon /></span>
          <span className="knob"></span>
        </span>
      </label>
    </header>
  );
}
