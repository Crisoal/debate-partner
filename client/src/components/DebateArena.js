// ==================================================
// CLIENT/SRC/COMPONENTS/DEBATEARENA.JS
// ==================================================

import React, { useState, useRef, useEffect } from 'react';
import { submitArgument } from '../utils/api';
import ArgumentAnalyzer from './ArgumentAnalyzer';

function DebateArena({ session, onEndDebate }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      speaker: 'ai',
      content: session.aiOpeningArgument,
      timestamp: new Date()
    }
  ]);
  const [currentArgument, setCurrentArgument] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmitArgument = async () => {
    if (!currentArgument.trim() || loading) return;

    const userMessage = {
      id: messages.length + 1,
      speaker: 'student',
      content: currentArgument,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await submitArgument({
        sessionId: session.sessionId,
        argument: currentArgument
      });

      const aiMessage = {
        id: messages.length + 2,
        speaker: 'ai',
        content: response.aiResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
      setLastAnalysis(response.analysis);
      setCurrentArgument('');
    } catch (error) {
      console.error('Failed to submit argument:', error);
      alert('Failed to submit argument. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmitArgument();
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              🎯 {session.topic.title}
            </h2>
            <div className="flex gap-4 text-sm">
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full">
                Your Position: {session.studentPosition === 'for' ? '✅ For' : '❌ Against'}
              </span>
              <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full">
                AI Position: {session.aiPosition === 'for' ? '✅ For' : '❌ Against'}
              </span>
            </div>
          </div>
          <button
            onClick={onEndDebate}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
          >
            End Debate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Debate Messages */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md">
            {/* Messages Container */}
            <div className="h-96 overflow-y-auto p-6 space-y-4 border-b">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.speaker === 'student' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-3xl p-4 rounded-lg ${
                      message.speaker === 'student'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-800 border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">
                        {message.speaker === 'student' ? '👤 You' : '🤖 AI Debate Partner'}
                      </span>
                      <span className="text-xs opacity-70">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-800 border p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">🤖 AI Debate Partner</span>
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6">
              <div className="space-y-4">
                <textarea
                  value={currentArgument}
                  onChange={(e) => setCurrentArgument(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Present your argument here... (Ctrl+Enter to submit)"
                  className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-24 resize-none"
                  disabled={loading}
                />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    Tip: Use evidence, address counterarguments, and question assumptions
                  </span>
                  <button
                    onClick={handleSubmitArgument}
                    disabled={!currentArgument.trim() || loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Analyzing...' : 'Submit Argument 🚀'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Argument Analysis Panel */}
        <div className="lg:col-span-1">
          <ArgumentAnalyzer analysis={lastAnalysis} />
        </div>
      </div>
    </div>
  );
}

export default DebateArena;