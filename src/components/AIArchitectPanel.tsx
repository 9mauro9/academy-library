import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/firebaseService';
import { Send, Bot } from 'lucide-react';

interface AIArchitectPanelProps {
  onPathExtracted: (path: any) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export const AIArchitectPanel: React.FC<AIArchitectPanelProps> = ({ onPathExtracted, onLoadingChange }) => {
  const [messages, setMessages] = useState<any[]>([
    {
      role: 'assistant',
      content: "Hello! I am the Academy Builder Learning Architect. I can design custom learning roadmaps using only our official topics catalog. Tell me what skills or outcomes you're looking to achieve (e.g., 'Assemble an intermediate Data Center track focusing on L2LS and MLAG')."
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const chatHistoryRef = useRef<HTMLDivElement>(null);

  const suggestionChips = [
    "Design a 10-hour Data Center Engineering path",
    "I need a beginners guide to VXLAN and EVPN",
    "What are the prerequisites for Symmetric IRB?",
    "Build a custom path focusing on BGP Underlays"
  ];

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);
    onLoadingChange?.(true);

    try {
      const data = await sendChatMessage(text, messages.slice(-10));
      
      const assistantMessage = { 
        role: 'assistant', 
        content: data.reply || "I've processed your request." 
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (data.learningPath && data.learningPath.modules && data.learningPath.modules.length > 0) {
        onPathExtracted(data.learningPath);
        
        setMessages(prev => [
          ...prev, 
          {
            role: 'system',
            content: `✨ Roadmap Updated: "${data.learningPath.title}" has been generated. Switch to the 'Manual Path' tab or view the timeline.`
          }
        ]);
      }

    } catch (err: any) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message || 'Could not communicate with the Learning Architect.'}` }
      ]);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="view-header" style={{ padding: '0.75rem 1.25rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
          <Bot size={18} className="text-secondary" />
          <span>Academy Builder Learning Architect Chat</span>
        </h3>
        <span className="fit-badge ok" style={{ fontSize: '0.65rem' }}>Gemini Core v3.5</span>
      </div>

      <div className="chat-history" ref={chatHistoryRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            {msg.role === 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.15rem' }}>
                <Bot size={12} className="text-secondary" />
                <span>Learning Architect</span>
              </div>
            )}
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-message assistant" style={{ opacity: 0.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="fit-badge warn" style={{ padding: '0.1rem 0.3rem', margin: 0 }}>Thinking</div>
              <span>Assembling custom recommendation data...</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggestion Chips */}
      <div style={{ padding: '0.5rem 1.25rem', display: 'flex', gap: '0.5rem', overflowX: 'auto', flexShrink: 0, borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.05)' }}>
        {suggestionChips.map((chip, idx) => (
          <button 
            key={idx} 
            onClick={() => handleSendMessage(chip)}
            className="btn-action" 
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', borderRadius: '15px', whiteSpace: 'nowrap', flexShrink: 0 }}
            disabled={loading}
          >
            {chip}
          </button>
        ))}
      </div>

      <form 
        onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }} 
        className="chat-input-area"
      >
        <input
          type="text"
          className="chat-input"
          placeholder="Ask the architect to design, expand, or adjust your path..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn-action btn-primary" style={{ padding: '0.75rem 1rem' }} disabled={loading}>
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};
