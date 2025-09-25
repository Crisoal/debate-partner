// ==================================================
// CLIENT/SRC/COMPONENTS/TOPICSELECTOR.JS - Enhanced with Voice and Peer Modes
// ==================================================

import React, { useState, useEffect } from 'react';
import { fetchTopics, startDebate, startVoiceDebate, startPeerDebate, checkAudioSupport, requestMicrophonePermission } from '../utils/api';

function TopicSelector({ onStartDebate, onStartVoiceDebate, onStartPeerDebate, onViewDashboard }) {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [position, setPosition] = useState('for');
  const [debateMode, setDebateMode] = useState('ai'); // 'ai', 'voice', 'peer'
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [audioSupport, setAudioSupport] = useState({});
  const [micPermission, setMicPermission] = useState(null);

  // Peer debate settings
  const [timePerTurn, setTimePerTurn] = useState(120); // seconds
  const [totalRounds, setTotalRounds] = useState(3);

  useEffect(() => {
    loadTopics();
    checkAudioCapabilities();
  }, []);

  const loadTopics = async () => {
    try {
      const data = await fetchTopics();
      setTopics(data);
    } catch (error) {
      console.error('Failed to load topics:', error);
    }
  };

  const checkAudioCapabilities = () => {
    const support = checkAudioSupport();
    setAudioSupport(support);
  };

  const requestMicPermission = async () => {
    const hasPermission = await requestMicrophonePermission();
    setMicPermission(hasPermission);
    return hasPermission;
  };

  const handleStartDebate = async () => {
    if (!selectedTopic || !studentName.trim()) {
      alert('Please select a topic and enter your name');
      return;
    }

    if ((debateMode === 'voice' || debateMode === 'peer') && !audioSupport.getUserMedia) {
      alert('Your browser does not support audio recording. Please try the regular AI debate mode.');
      return;
    }

    if ((debateMode === 'voice' || debateMode === 'peer') && micPermission === null) {
      const hasPermission = await requestMicPermission();
      if (!hasPermission) {
        alert('Microphone permission is required for voice debates. Please allow access and try again.');
        return;
      }
    }

    setLoading(true);
    try {
      let session;

      switch (debateMode) {
        case 'voice':
          session = await startVoiceDebate({
            topicId: selectedTopic.id,
            studentPosition: position,
            studentName: studentName.trim()
          });
          onStartVoiceDebate(session);
          break;

        case 'peer':
          session = await startPeerDebate({
            topicId: selectedTopic.id,
            studentName: studentName.trim(),
            studentPosition: position,
            timePerTurn,
            totalRounds
          });

          // Handle different response states from peer debate
          if (session.state === 'waiting') {
            // Show waiting UI - pass the session data including topic info
            const waitingSession = {
              ...session,
              topic: selectedTopic,
              studentName: studentName.trim(),
              studentPosition: position,
              timePerTurn,
              totalRounds
            };
            onStartPeerDebate(waitingSession);
          } else if (session.sessionId) {
            // Match found immediately - proceed with full session
            onStartPeerDebate(session);
          } else {
            throw new Error('Invalid response from peer debate start');
          }
          break;

        default: // 'ai'
          session = await startDebate({
            topicId: selectedTopic.id,
            studentPosition: position,
            studentName: studentName.trim(),
            debateMode: 'ai'
          });
          onStartDebate(session);
      }

    } catch (error) {
      console.error('Failed to start debate:', error);
      alert('Failed to start debate: ' + error.message);
    } finally {
      setLoading(false);
      setShowModal(false);
    }
  };

  const getDebateModeInfo = (mode) => {
    switch (mode) {
      case 'voice':
        return {
          title: '🎤 Voice Debate',
          description: 'Speak your arguments and listen to AI responses',
          requirements: audioSupport.getUserMedia ? 'Microphone access required' : 'Not supported in your browser'
        };
      case 'peer':
        return {
          title: '🤝 Peer Debate',
          description: 'Debate against another student with AI moderation',
          requirements: 'Timed turns, competitive scoring'
        };
      default:
        return {
          title: '💬 Text Debate',
          description: 'Traditional typed debate with AI partner',
          requirements: 'Type your arguments and read AI responses'
        };
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-4">Choose Your Debate Experience</h2>
        <p className="text-gray-600 text-lg">
          Challenge yourself with AI-powered Socratic debates that sharpen your critical thinking skills
        </p>
      </div>

      {/* Student Name Input */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Your Name (for tracking progress)
        </label>
        <div className="flex gap-4 items-end">
          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your name..."
          />
          {studentName && (
            <button
              onClick={() => onViewDashboard(studentName)}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              📊 View My Progress
            </button>
          )}
        </div>
      </div>

      {/* Debate Mode Selection */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Select Debate Mode</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['ai', 'voice', 'peer'].map((mode) => {
            const info = getDebateModeInfo(mode);
            const isDisabled = (mode === 'voice' || mode === 'peer') && !audioSupport.getUserMedia;

            return (
              <div
                key={mode}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${debateMode === mode
                    ? 'border-blue-500 bg-blue-50'
                    : isDisabled
                      ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                onClick={() => !isDisabled && setDebateMode(mode)}
              >
                <div className="text-lg font-semibold text-gray-800 mb-2">{info.title}</div>
                <div className="text-sm text-gray-600 mb-3">{info.description}</div>
                <div className={`text-xs ${isDisabled ? 'text-red-500' : 'text-blue-600'}`}>
                  {info.requirements}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Topics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {topics.map((topic) => (
          <div
            key={topic.id}
            className={`bg-white rounded-lg shadow-md p-6 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${selectedTopic?.id === topic.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
            onClick={() => setSelectedTopic(topic)}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold text-gray-800 leading-tight">
                {topic.title}
              </h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                {topic.category}
              </span>
            </div>
            <p className="text-gray-600 text-sm">
              {topic.description}
            </p>
            {selectedTopic?.id === topic.id && (
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowModal(true);
                  }}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  {getDebateModeInfo(debateMode).title.split(' ')[0]} Start Debate
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Debate Setup Modal */}
      {showModal && selectedTopic && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Setup Your {getDebateModeInfo(debateMode).title}</h3>

            <div className="mb-4">
              <h4 className="font-semibold text-gray-800 mb-2">Topic:</h4>
              <p className="text-gray-600 text-sm">{selectedTopic.title}</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Choose your position:
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="position"
                    value="for"
                    checked={position === 'for'}
                    onChange={(e) => setPosition(e.target.value)}
                    className="mr-3"
                  />
                  <span className="text-green-600 font-medium">✅ For (Support the statement)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="position"
                    value="against"
                    checked={position === 'against'}
                    onChange={(e) => setPosition(e.target.value)}
                    className="mr-3"
                  />
                  <span className="text-red-600 font-medium">❌ Against (Oppose the statement)</span>
                </label>
              </div>
            </div>

            {/* Peer Debate Settings */}
            {debateMode === 'peer' && (
              <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="font-semibold text-purple-800 mb-3">Peer Debate Settings</h4>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time per turn: {formatTime(timePerTurn)}
                  </label>
                  <input
                    type="range"
                    min="60"
                    max="300"
                    step="30"
                    value={timePerTurn}
                    onChange={(e) => setTimePerTurn(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>1:00</span>
                    <span>5:00</span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Total rounds: {totalRounds}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={totalRounds}
                    onChange={(e) => setTotalRounds(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>1</span>
                    <span>5</span>
                  </div>
                </div>

                <div className="text-sm text-purple-700">
                  <p>• You'll be matched with another student</p>
                  <p>• AI moderator will provide real-time feedback</p>
                  <p>• Comparative analysis at the end</p>
                </div>
              </div>
            )}

            {/* Voice Mode Requirements */}
            {debateMode === 'voice' && (
              <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <h4 className="font-semibold text-yellow-800 mb-2">Voice Mode Requirements</h4>
                <div className="text-sm text-yellow-700 space-y-1">
                  <p>✓ Microphone: {audioSupport.getUserMedia ? 'Supported' : 'Not available'}</p>
                  <p>✓ Speech Synthesis: {audioSupport.speechSynthesis ? 'Supported' : 'Not available'}</p>
                  {micPermission === false && (
                    <p className="text-red-600 font-medium">⚠️ Microphone permission denied</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartDebate}
                disabled={loading || !studentName.trim() ||
                  ((debateMode === 'voice' || debateMode === 'peer') && !audioSupport.getUserMedia)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Starting...' : `Begin ${getDebateModeInfo(debateMode).title}! 🚀`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TopicSelector;