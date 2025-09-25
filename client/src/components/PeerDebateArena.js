// ==================================================
// CLIENT/SRC/COMPONENTS/PEERDEBATEARENA.JS
// ==================================================

import React, { useState, useRef, useEffect } from 'react';
import { joinPeerDebate, submitPeerArgument, leavePeerDebate } from '../utils/api';

function PeerDebateArena({ session, onEndDebate, studentName }) {
  const [messages, setMessages] = useState([]);
  const [currentArgument, setCurrentArgument] = useState('');
  const [loading, setLoading] = useState(false);
  const [debateState, setDebateState] = useState(session.state || 'waiting'); // 'waiting', 'active', 'finished'
  const [currentSpeaker, setCurrentSpeaker] = useState(session.currentSpeaker);
  const [timeRemaining, setTimeRemaining] = useState(session.timePerTurn || 120);
  const [participants, setParticipants] = useState(session.participants || []);
  const [moderatorFeedback, setModeratorFeedback] = useState(null);
  const [finalAnalysis, setFinalAnalysis] = useState(null);
  const [totalRounds, setTotalRounds] = useState(session.totalRounds || 3);
  const [currentRound, setCurrentRound] = useState(session.currentRound || 1);
  
  const messagesEndRef = useRef(null);
  const timerRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    // Initialize WebSocket connection for real-time updates
    initializeWebSocket();
    scrollToBottom();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (debateState === 'active' && currentSpeaker === studentName) {
      startTimer();
    } else {
      stopTimer();
    }
  }, [currentSpeaker, debateState, studentName]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeWebSocket = () => {
    const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:5000'}/debate/${session.sessionId}`;
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
    
    wsRef.current.onclose = () => {
      console.log('WebSocket connection closed');
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'new_message':
        setMessages(prev => [...prev, data.message]);
        break;
      case 'state_update':
        setDebateState(data.state);
        setCurrentSpeaker(data.currentSpeaker);
        setCurrentRound(data.currentRound);
        setTimeRemaining(data.timeRemaining || 120);
        break;
      case 'moderator_feedback':
        setModeratorFeedback(data.feedback);
        break;
      case 'participant_joined':
        setParticipants(prev => [...prev, data.participant]);
        break;
      case 'participant_left':
        setParticipants(prev => prev.filter(p => p.name !== data.participantName));
        break;
      case 'debate_ended':
        setFinalAnalysis(data.analysis);
        setDebateState('finished');
        break;
      case 'timer_update':
        setTimeRemaining(data.timeRemaining);
        break;
    }
  };

  const startTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleTimeUp = () => {
    if (currentSpeaker === studentName) {
      alert('Time is up! Your turn has ended.');
      // Auto-submit empty argument or current partial argument
      if (currentArgument.trim()) {
        handleSubmitArgument();
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmitArgument = async () => {
    if (!currentArgument.trim() || loading || currentSpeaker !== studentName) return;

    const userMessage = {
      id: Date.now(),
      speaker: studentName,
      content: currentArgument,
      timestamp: new Date(),
      round: currentRound
    };

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await submitPeerArgument({
        sessionId: session.sessionId,
        argument: currentArgument,
        studentName: studentName
      });

      if (response.moderatorComment) {
        const moderatorMessage = {
          id: Date.now() + 1,
          speaker: 'moderator',
          content: response.moderatorComment,
          timestamp: new Date(),
          isModerator: true
        };
        setMessages(prev => [...prev, moderatorMessage]);
      }

      setCurrentArgument('');
      setModeratorFeedback(response.feedback);

    } catch (error) {
      console.error('Failed to submit argument:', error);
      alert('Failed to submit argument. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveDebate = async () => {
    try {
      await leavePeerDebate(session.sessionId, studentName);
      onEndDebate();
    } catch (error) {
      console.error('Error leaving debate:', error);
      onEndDebate(); // Leave anyway
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerColor = () => {
    if (timeRemaining > 60) return 'text-green-600';
    if (timeRemaining > 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (debateState === 'waiting') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">🤝 Waiting for Opponent</h2>
          <p className="text-gray-600 mb-6">Topic: {session.topic.title}</p>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500 mb-6">Searching for another student to debate with...</p>
          <button
            onClick={handleLeaveDebate}
            className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
          >
            Cancel & Return to Topics
          </button>
        </div>
      </div>
    );
  }

  if (debateState === 'finished' && finalAnalysis) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">🏆 Debate Complete!</h2>
          
          {/* Final Scores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {finalAnalysis.participantScores.map((participant, index) => (
              <div key={index} className="text-center p-6 bg-gray-50 rounded-lg">
                <h3 className="text-xl font-semibold mb-2">{participant.name}</h3>
                <div className="text-3xl font-bold text-blue-600 mb-2">{participant.overallScore}/10</div>
                <div className="space-y-1 text-sm">
                  <div>Logic: {participant.logicScore}/10</div>
                  <div>Evidence: {participant.evidenceScore}/10</div>
                  <div>Clarity: {participant.clarityScore}/10</div>
                </div>
              </div>
            ))}
          </div>

          {/* AI Moderator's Final Analysis */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">🤖 AI Moderator's Analysis</h3>
            <div className="space-y-4 text-gray-700">
              <div>
                <strong>Winner:</strong> {finalAnalysis.winner} 
                {finalAnalysis.winnerReason && ` - ${finalAnalysis.winnerReason}`}
              </div>
              <div>
                <strong>Key Observations:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {finalAnalysis.keyObservations.map((obs, index) => (
                    <li key={index}>{obs}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Areas for Improvement:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {finalAnalysis.improvements.map((imp, index) => (
                    <li key={index}>{imp}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={onEndDebate}
              className="px-8 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-lg"
            >
              Return to Topics
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              🤝 {session.topic.title} - Peer Debate
            </h2>
            <div className="flex gap-4 text-sm">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                Round {currentRound} of {totalRounds}
              </span>
              <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full">
                {participants.length} participants
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getTimerColor()}`}>
              ⏱️ {formatTime(timeRemaining)}
            </div>
            <div className="text-sm text-gray-600">
              {currentSpeaker === studentName ? "Your turn" : `${currentSpeaker}'s turn`}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Participants Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">👥 Participants</h3>
            {participants.map((participant, index) => (
              <div 
                key={index} 
                className={`flex items-center justify-between p-2 rounded mb-2 ${
                  participant.name === currentSpeaker ? 'bg-green-100 text-green-800' :
                  participant.name === studentName ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-700'
                }`}
              >
                <span className="text-sm font-medium">{participant.name}</span>
                <span className="text-xs">
                  {participant.position === 'for' ? '✅' : '❌'}
                </span>
              </div>
            ))}
          </div>

          {/* Live Moderator Feedback */}
          {moderatorFeedback && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-800 mb-2">🤖 AI Moderator</h4>
              <div className="text-sm text-yellow-700">
                {moderatorFeedback.comment}
              </div>
              {moderatorFeedback.warning && (
                <div className="text-xs text-red-600 mt-2 font-medium">
                  ⚠️ {moderatorFeedback.warning}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Debate Messages */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-md">
            {/* Messages Container */}
            <div className="h-96 overflow-y-auto p-6 space-y-4 border-b">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.speaker === studentName ? 'justify-end' : 
                    message.speaker === 'moderator' ? 'justify-center' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-3xl p-4 rounded-lg ${
                      message.speaker === studentName
                        ? 'bg-blue-500 text-white'
                        : message.speaker === 'moderator'
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                        : 'bg-gray-100 text-gray-800 border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">
                        {message.speaker === studentName ? '👤 You' : 
                         message.speaker === 'moderator' ? '🤖 AI Moderator' : 
                         `👥 ${message.speaker}`}
                      </span>
                      {message.round && (
                        <span className="text-xs bg-black bg-opacity-20 text-current px-2 py-1 rounded-full">
                          R{message.round}
                        </span>
                      )}
                      <span className="text-xs opacity-70">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-center">
                  <div className="bg-gray-100 text-gray-800 border p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600"></div>
                      <span className="font-semibold">AI is analyzing...</span>
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
                  placeholder={
                    currentSpeaker === studentName 
                      ? "Present your argument here..." 
                      : "Wait for your turn to respond..."
                  }
                  className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-24 resize-none"
                  disabled={loading || currentSpeaker !== studentName}
                />
                <div className="flex justify-between items-center">
                  <div className="flex gap-4">
                    <span className="text-sm text-gray-500">
                      {currentSpeaker === studentName ? 
                        `Your turn - ${formatTime(timeRemaining)} remaining` :
                        `Waiting for ${currentSpeaker}'s response`
                      }
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleLeaveDebate}
                      className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                    >
                      Leave Debate
                    </button>
                    <button
                      onClick={handleSubmitArgument}
                      disabled={!currentArgument.trim() || loading || currentSpeaker !== studentName}
                      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Submitting...' : 'Submit Argument'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PeerDebateArena;