import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { X, Send, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { io } from "socket.io-client";

const BASE = import.meta.env.BASE_URL;

interface Message {
  role: "user" | "assistant";
  content: string;
}

function BeraFace({ talking, thinking }: { talking: boolean; thinking: boolean }) {
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      {/* Outer glow ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "conic-gradient(from 0deg, #00d4ff, #7c3aed, #00d4ff)",
          animation: thinking ? "spin 1.2s linear infinite" : "spin 4s linear infinite",
          padding: "2px",
        }}
      />
      <div className="absolute inset-[2px] rounded-full bg-[#0a0f1e]" />

      {/* Face */}
      <svg
        viewBox="0 0 56 56"
        className="relative z-10 w-12 h-12"
        style={{ filter: "drop-shadow(0 0 6px rgba(0,212,255,0.5))" }}
      >
        {/* Face background */}
        <circle cx="28" cy="28" r="24" fill="#0d1526" />
        <circle cx="28" cy="28" r="23" fill="url(#faceGrad)" opacity="0.6" />

        <defs>
          <radialGradient id="faceGrad" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#060d1a" />
          </radialGradient>
          <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#0070a8" />
          </radialGradient>
        </defs>

        {/* Left eye */}
        <ellipse
          cx="20"
          cy="24"
          rx="4"
          ry="4"
          fill="url(#eyeGlow)"
          style={{
            animation: "blink 4s ease-in-out infinite",
            filter: "drop-shadow(0 0 3px #00d4ff)",
          }}
        />
        {/* Left pupil */}
        <circle cx="20" cy="24" r="2" fill="#001f33" />
        <circle cx="21" cy="23" r="0.8" fill="white" opacity="0.7" />

        {/* Right eye */}
        <ellipse
          cx="36"
          cy="24"
          rx="4"
          ry="4"
          fill="url(#eyeGlow)"
          style={{
            animation: "blink 4s ease-in-out infinite 0.1s",
            filter: "drop-shadow(0 0 3px #00d4ff)",
          }}
        />
        {/* Right pupil */}
        <circle cx="36" cy="24" r="2" fill="#001f33" />
        <circle cx="37" cy="23" r="0.8" fill="white" opacity="0.7" />

        {/* Mouth */}
        {thinking ? (
          /* Thinking dots */
          <>
            <circle cx="22" cy="36" r="1.8" fill="#00d4ff" style={{ animation: "pulse 0.8s ease-in-out infinite" }} />
            <circle cx="28" cy="36" r="1.8" fill="#00d4ff" style={{ animation: "pulse 0.8s ease-in-out infinite 0.25s" }} />
            <circle cx="34" cy="36" r="1.8" fill="#00d4ff" style={{ animation: "pulse 0.8s ease-in-out infinite 0.5s" }} />
          </>
        ) : talking ? (
          /* Talking mouth — animated rectangle height */
          <rect
            x="20"
            y="33"
            width="16"
            height="5"
            rx="2.5"
            fill="#00d4ff"
            opacity="0.9"
            style={{ animation: "talk 0.35s ease-in-out infinite alternate" }}
          />
        ) : (
          /* Smile */
          <path
            d="M 20 34 Q 28 40 36 34"
            stroke="#00d4ff"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
        )}

        {/* Antenna */}
        <line x1="28" y1="4" x2="28" y2="10" stroke="#00d4ff" strokeWidth="1.5" opacity="0.7" />
        <circle cx="28" cy="3.5" r="2" fill="#00d4ff" style={{ animation: "pulse 2s ease-in-out infinite" }} />

        {/* Cheek blushes */}
        <circle cx="12" cy="30" r="3.5" fill="#ff6b9d" opacity="0.25" />
        <circle cx="44" cy="30" r="3.5" fill="#ff6b9d" opacity="0.25" />
      </svg>

      <style>{`
        @keyframes blink {
          0%, 90%, 100% { ry: 4; }
          95% { ry: 0.5; }
        }
        @keyframes talk {
          from { height: 3px; y: 35px; }
          to   { height: 7px; y: 33px; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50%       { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}

export function BeraGuide() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi, I'm **BERA**, your BERAHOST guide. Ask me anything — I can show you around, check your bots, or answer questions.",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [talking, setTalking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Socket: join user room for crash alerts
  useEffect(() => {
    if (!user?.id) return;
    const sock = io({ path: "/api/ws/socket.io" });
    sock.emit("join:user", user.id);
    sock.on("crash:alert", ({ deploymentId, customName }: { deploymentId: number; customName?: string }) => {
      const label = customName ?? `#${deploymentId}`;
      toast({
        title: "Bot needs attention",
        description: `Bot ${label} crashed and is auto-restarting.`,
        variant: "destructive",
      });
      // Add a message to the guide if open
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Alert: Bot **${label}** just crashed. It is auto-restarting. Want me to take you to the console? [NAVIGATE:/deployments]`,
        },
      ]);
    });
    return () => { sock.disconnect(); };
  }, [user?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const parseAndNavigate = (content: string): string => {
    const match = content.match(/\[NAVIGATE:([^\]]+)\]/);
    if (match) {
      const path = match[1];
      setTimeout(() => {
        setLocation(path);
        setOpen(false);
      }, 600);
      return content.replace(/\[NAVIGATE:[^\]]+\]/, "").trim();
    }
    return content;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || thinking) return;

    const userMsg: Message = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setThinking(true);

    try {
      const res = await fetch(`${BASE}api/guide/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const raw = data.content ?? "Sorry, I had trouble responding. Try again!";
      const clean = parseAndNavigate(raw);

      setThinking(false);
      setTalking(true);
      setMessages((prev) => [...prev, { role: "assistant", content: clean }]);
      setTimeout(() => setTalking(false), Math.min(clean.length * 25, 3000));
    } catch {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm having connection trouble. Please try again!" },
      ]);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Don't render if not logged in
  if (!user) return null;

  return (
    <div className="fixed bottom-24 right-5 z-[60] flex flex-col items-end gap-3 lg:bottom-5">
      {/* Chat panel */}
      {open && (
        <div
          className="w-80 rounded-2xl border border-primary/30 bg-[#080e1d]/95 backdrop-blur-xl shadow-[0_0_40px_rgba(0,212,255,0.15)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{ height: "420px" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-gradient-to-r from-primary/10 to-secondary/10">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-sm font-bold">B</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-primary font-mono">BERA GUIDE</p>
              <p className="text-[10px] text-muted-foreground font-mono">
                {thinking ? "Thinking..." : talking ? "Talking..." : "Online"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary/20 text-foreground rounded-tr-sm border border-primary/20"
                        : "bg-white/5 text-foreground rounded-tl-sm border border-white/10"
                    }`}
                  >
                    {renderMarkdown(msg.content)}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-3 py-2">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary"
                          style={{ animation: `pulse 0.8s ease-in-out infinite ${i * 0.2}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="px-3 py-3 border-t border-border/30 flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me anything..."
              className="flex-1 h-8 text-xs bg-white/5 border-white/10 font-mono placeholder:text-muted-foreground/50 focus:border-primary/50"
              disabled={thinking}
            />
            <Button
              size="icon"
              className="h-8 w-8 bg-primary hover:bg-primary/80 flex-shrink-0"
              onClick={sendMessage}
              disabled={!input.trim() || thinking}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative focus:outline-none group"
        title="BERA Guide"
      >
        <BeraFace talking={talking} thinking={thinking} />
        {/* Tooltip label */}
        {!open && (
          <span className="absolute right-16 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-mono text-primary bg-[#080e1d]/90 border border-primary/30 rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            BERA GUIDE
          </span>
        )}
        {/* Close X when open */}
        {open && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center">
            <X className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </button>
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  // Very simple markdown: **bold** and line breaks
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-primary">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
