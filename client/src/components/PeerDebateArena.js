// ==================================================
// ENHANCED CLIENT/SRC/COMPONENTS/PEERDEBATEARENA.JS - With Real-Time Voice Broadcasting
// ==================================================

import React, { useState, useRef, useEffect } from 'react';
import { joinPeerDebate, leavePeerDebate, submitPeerVoiceArgument } from '../utils/api'; // FIXED IMPORT

function PeerDebateArena({ session, onEndDebate, studentName }) {
  // Add null checks and default values
  const sessionData = session || {};
  const topic = sessionData.topic || { title: 'Loading...', description: '' };
  const participants = sessionData.participants || [];

  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingOpponentAudio, setIsPlayingOpponentAudio] = useState(false);
  const [debateState, setDebateState] = useState(sessionData.state || 'waiting');
  const [currentSpeaker, setCurrentSpeaker] = useState(sessionData.currentSpeaker || '');
  const [timeRemaining, setTimeRemaining] = useState(sessionData.timePerTurn || 120);
  const [participantsList, setParticipantsList] = useState(participants);
  const [moderatorFeedback, setModeratorFeedback] = useState(null);
  const [finalAnalysis, setFinalAnalysis] = useState(null);
  const [totalRounds, setTotalRounds] = useState(sessionData.totalRounds || 3);
  const [currentRound, setCurrentRound] = useState(sessionData.currentRound || 1);
  const [recordingTime, setRecordingTime] = useState(0);
  const [lastTranscription, setLastTranscription] = useState('');
  const [opponentSpeaking, setOpponentSpeaking] = useState(false);

  const messagesEndRef = useRef(null);
  const timerRef = useRef(null);
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const waitingWsRef = useRef(null);
  const audioContextRef = useRef(null);
  const opponentAudioRef = useRef(null);

  // Initialize WebSocket for waiting room or active debate
  useEffect(() => {
    if (debateState === 'waiting') {
      initializeWaitingWebSocket();
    } else if (session?.sessionId) {
      initializeDebateWebSocket();
    }

    scrollToBottom();

    return () => {
      cleanup();
    };
  }, [session?.sessionId, studentName, debateState]);

  // Timer management
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

  const cleanup = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (waitingWsRef.current) {
      waitingWsRef.current.close();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    stopRecording();
  };

  const initializeWaitingWebSocket = () => {
    if (!studentName || !topic.id) return;

    const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:5000'}/waiting/${encodeURIComponent(studentName)}/${topic.id}`;

    try {
      waitingWsRef.current = new WebSocket(wsUrl);

      waitingWsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'match_found') {
            console.log('Match found via WebSocket:', data);
            // Update the session with match data
            const updatedSession = {
              sessionId: data.sessionId,
              topic: data.topic,
              participants: data.participants,
              currentSpeaker: data.currentSpeaker,
              timePerTurn: data.timePerTurn,
              totalRounds: data.totalRounds,
              currentRound: 1,
              state: 'active',
              studentName: data.studentName,
              studentPosition: data.studentPosition
            };
            
            // Close waiting WebSocket
            if (waitingWsRef.current) {
              waitingWsRef.current.close();
            }
            
            // Update state
            setDebateState('active');
            setParticipantsList(data.participants);
            setCurrentSpeaker(data.currentSpeaker);
            setTimeRemaining(data.timePerTurn);
            
            // Initialize debate WebSocket
            setTimeout(() => {
              initializeDebateWebSocket(data.sessionId);
            }, 100);
          }
        } catch (error) {
          console.error('Failed to parse waiting WebSocket message:', error);
        }
      };

      waitingWsRef.current.onclose = () => {
        console.log('Waiting WebSocket connection closed');
      };

      waitingWsRef.current.onerror = (error) => {
        console.error('Waiting WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create waiting WebSocket connection:', error);
    }
  };

  const initializeDebateWebSocket = (sessionId = session?.sessionId) => {
    if (!sessionId) {
      console.error('Cannot initialize debate WebSocket: missing session ID');
      return;
    }

    const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:5000'}/debate/peer/${sessionId}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('Debate WebSocket connection closed');
      };

      wsRef.current.onerror = (error) => {
        console.error('Debate WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create debate WebSocket connection:', error);
    }
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'new_message':
        if (data.message) {
          setMessages(prev => [...prev, data.message]);
        }
        break;
      case 'voice_audio_stream':
        // NEW: Handle real-time audio from opponent
        if (data.speakerName !== studentName && data.audioData) {
          playOpponentAudio(data.audioData);
        }
        break;
      case 'opponent_speaking_start':
        if (data.speakerName !== studentName) {
          setOpponentSpeaking(true);
        }
        break;
      case 'opponent_speaking_end':
        if (data.speakerName !== studentName) {
          setOpponentSpeaking(false);
        }
        break;
      case 'state_update':
        if (data.state) setDebateState(data.state);
        if (data.currentSpeaker) setCurrentSpeaker(data.currentSpeaker);
        if (data.currentRound) setCurrentRound(data.currentRound);
        if (data.timeRemaining !== undefined) setTimeRemaining(data.timeRemaining || 120);
        break;
      case 'moderator_feedback':
        if (data.feedback) {
          setModeratorFeedback(data.feedback);
        }
        break;
      case 'participant_joined':
        if (data.participant) {
          setParticipantsList(prev => [...prev, data.participant]);
        }
        break;
      case 'participant_left':
        if (data.participantName) {
          setParticipantsList(prev => prev.filter(p => p.name !== data.participantName));
        }
        break;
      case 'debate_ended':
        if (data.analysis) {
          setFinalAnalysis(data.analysis);
        }
        setDebateState('finished');
        break;
      case 'timer_update':
        if (data.timeRemaining !== undefined) {
          setTimeRemaining(data.timeRemaining);
        }
        break;
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  };

  // NEW: Function to play opponent's audio in real-time
  const playOpponentAudio = async (audioDataBase64) => {
    try {
      setIsPlayingOpponentAudio(true);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Convert base64 to ArrayBuffer
      const audioBuffer = Uint8Array.from(atob(audioDataBase64), c => c.charCodeAt(0));
      
      // Decode and play audio
      const decodedAudio = await audioContextRef.current.decodeAudioData(audioBuffer.buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = decodedAudio;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        setIsPlayingOpponentAudio(false);
      };
      
      source.start();
      
    } catch (error) {
      console.error('Error playing opponent audio:', error);
      setIsPlayingOpponentAudio(false);
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
    if (currentSpeaker === studentName && isRecording) {
      alert('Time is up! Your recording will end automatically.');
      stopRecording();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Enhanced voice recording with real-time streaming
  const startRecording = async () => {
    if (currentSpeaker !== studentName || isRecording || isProcessing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      audioChunksRef.current = [];
      
      // NEW: Real-time audio streaming
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
        
        // Stream audio chunks to opponent in real-time
        if (event.data.size > 0 && wsRef.current) {
          const reader = new FileReader();
          reader.onload = () => {
            const audioData = reader.result.split(',')[1]; // Remove data URL prefix
            wsRef.current.send(JSON.stringify({
              type: 'voice_audio_stream',
              speakerName: studentName,
              audioData: audioData,
              sessionId: session.sessionId
            }));
          };
          reader.readAsDataURL(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = handleRecordingStop;
      mediaRecorderRef.current.onstart = () => {
        // Notify opponents that this student started speaking
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'opponent_speaking_start',
            speakerName: studentName,
            sessionId: session.sessionId
          }));
        }
      };
      
      // Start recording with smaller time slices for real-time streaming
      mediaRecorderRef.current.start(1000); // 1 second chunks
      setIsRecording(true);
      setRecordingTime(0);
      setLastTranscription('');
      
      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 30) { // 30 second limit
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Unable to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      
      // Notify opponents that this student stopped speaking
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'opponent_speaking_end',
          speakerName: studentName,
          sessionId: session.sessionId
        }));
      }
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const handleRecordingStop = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    
    if (audioBlob.size < 1000) {
      alert('Recording too short. Please try again.');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Submit voice argument to peer debate endpoint
      const response = await submitPeerVoiceArgument({
        sessionId: session.sessionId,
        audioBlob: audioBlob,
        studentName: studentName
      });
      
      setLastTranscription(response.transcription);
      
      if (response.moderatorComment) {
        setModeratorFeedback(response.feedback);
      }

      if (response.debateComplete) {
        setFinalAnalysis(response.finalAnalysis);
        setDebateState('finished');
      }
      
    } catch (error) {
      console.error('Failed to process voice argument:', error);
      alert('Failed to process your argument. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLeaveDebate = async () => {
    try {
      if (session?.sessionId) {
        await leavePeerDebate(session.sessionId, studentName);
      }
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

  // Early return if essential data is missing
  if (!studentName) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-red-800 mb-4">Error Loading Debate</h2>
          <p className="text-red-600 mb-6">
            Missing required information to start the debate. Please try again.
          </p>
          <button
            onClick={onEndDebate}
            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Return to Topics
          </button>
        </div>
      </div>
    );
  }

  if (debateState === 'waiting') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">🤝 Waiting for Opponent</h2>
          <p className="text-gray-600 mb-2">Topic: <strong>{topic.title}</strong></p>
          <p className="text-gray-600 mb-6">Your Position: <strong>{session.studentPosition === 'for' ? 'For' : 'Against'}</strong></p>

          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500 mb-4">Searching for another student to debate with...</p>

          {/* Show waiting time */}
          <p className="text-sm text-gray-400 mb-6">
            This usually takes 1-2 minutes. You can cancel anytime.
          </p>

          {/* Settings reminder */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left max-w-md mx-auto">
            <h3 className="font-semibold text-gray-700 mb-2">Debate Settings:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Time per turn: {Math.floor((session.timePerTurn || 120) / 60)}:{((session.timePerTurn || 120) % 60).toString().padStart(2, '0')}</li>
              <li>• Total rounds: {session.totalRounds || 3}</li>
              <li>• Voice-only debate (no typing)</li>
              <li>• Real-time AI moderation</li>
              <li>• Live audio streaming</li>
            </ul>
          </div>

          <button
            onClick={handleLeaveDebate}
            className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
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
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Voice Debate Complete!</h2>

          {/* Final Scores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {finalAnalysis.participantScores?.map((participant, index) => (
              <div key={index} className="text-center p-6 bg-gray-50 rounded-lg">
                <h3 className="text-xl font-semibold mb-2">{participant.name}</h3>
                <div className="text-3xl font-bold text-blue-600 mb-2">{participant.overallScore || 0}/10</div>
                <div className="space-y-1 text-sm">
                  <div>Logic: {participant.logicScore || 0}/10</div>
                  <div>Evidence: {participant.evidenceScore || 0}/10</div>
                  <div>Clarity: {participant.clarityScore || 0}/10</div>
                </div>
              </div>
            )) || <div>No scores available</div>}
          </div>

          {/* AI Moderator's Final Analysis */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">AI Moderator's Analysis</h3>
            <div className="space-y-4 text-gray-700">
              <div>
                <strong>Winner:</strong> {finalAnalysis.winner || 'No winner determined'}
                {finalAnalysis.winnerReason && ` - ${finalAnalysis.winnerReason}`}
              </div>
              {finalAnalysis.keyObservations && finalAnalysis.keyObservations.length > 0 && (
                <div>
                  <strong>Key Observations:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {finalAnalysis.keyObservations.map((obs, index) => (
                      <li key={index}>{obs}</li>
                    ))}
                  </ul>
                </div>
              )}
              {finalAnalysis.improvements && finalAnalysis.improvements.length > 0 && (
                <div>
                  <strong>Areas for Improvement:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {finalAnalysis.improvements.map((imp, index) => (
                      <li key={index}>{imp}</li>
                    ))}
                  </ul>
                </div>
              )}
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
              🎤 {topic.title} - Live Voice Peer Debate
            </h2>
            <div className="flex gap-4 text-sm">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                Round {currentRound} of {totalRounds}
              </span>
              <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full">
                {participantsList.length} participants
              </span>
              {isPlayingOpponentAudio && (
                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full animate-pulse">
                  🎧 Opponent Speaking
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getTimerColor()}`}>
              {formatTime(timeRemaining)}
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
            <h3 className="font-semibold text-gray-800 mb-3">Participants</h3>
            {participantsList.length > 0 ? (
              participantsList.map((participant, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-2 rounded mb-2 ${
                    participant.name === currentSpeaker ? 'bg-green-100 text-green-800' :
                    participant.name === studentName ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className="text-sm font-medium">
                    {participant.name}
                    {opponentSpeaking && participant.name !== studentName && (
                      <span className="ml-1 animate-pulse">🎤</span>
                    )}
                  </span>
                  <span className="text-xs">
                    {participant.position === 'for' ? '✓' : '✗'}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-sm">No participants loaded</div>
            )}
          </div>

          {/* Live Moderator Feedback */}
          {moderatorFeedback && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-800 mb-2">AI Moderator</h4>
              <div className="text-sm text-yellow-700">
                {moderatorFeedback.comment}
              </div>
              {moderatorFeedback.warning && (
                <div className="text-xs text-red-600 mt-2 font-medium">
                  Warning: {moderatorFeedback.warning}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Voice Interface */}
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
                        {message.speaker === studentName ? '🎤 You' :
                          message.speaker === 'moderator' ? '🤖 AI Moderator' :
                          `🎤 ${message.speaker}`}
                      </span>
                      {message.round && (
                        <span className="text-xs bg-black bg-opacity-20 text-current px-2 py-1 rounded-full">
                          R{message.round}
                        </span>
                      )}
                      {message.isVoice && (
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                          Voice
                        </span>
                      )}
                      <span className="text-xs opacity-70">
                        {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}

              {isProcessing && (
                <div className="flex justify-center">
                  <div className="bg-gray-100 text-gray-800 border p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600"></div>
                      <span className="font-semibold">Processing your voice argument...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Voice Controls */}
            <div className="p-6">
              <div className="flex flex-col items-center space-y-4">
                {/* Live Audio Status */}
                {isPlayingOpponentAudio && (
                  <div className="text-center">
                    <div className="text-green-600 font-semibold text-lg mb-2">
                      🎧 Listening to opponent...
                    </div>
                    <div className="flex justify-center space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <div 
                          key={i}
                          className="w-2 h-8 bg-green-400 animate-pulse rounded-full"
                          style={{ animationDelay: `${i * 0.1}s` }}
                        ></div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recording Status */}
                {isRecording && (
                  <div className="text-center">
                    <div className="text-red-600 font-semibold text-lg mb-2">
                      🔴 Recording... {formatTime(recordingTime)}
                    </div>
                    <div className="w-32 h-2 bg-red-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 animate-pulse"
                        style={{ width: `${Math.min((recordingTime / 30) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Last Transcription */}
                {lastTranscription && (
                  <div className="w-full p-3 bg-gray-50 rounded-lg border">
                    <div className="text-sm text-gray-600 mb-1">Last transcription:</div>
                    <div className="text-gray-800">{lastTranscription}</div>
                  </div>
                )}

                {/* Voice Button */}
                <div className="flex gap-4 items-center">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={isProcessing || currentSpeaker !== studentName || isPlayingOpponentAudio}
                      className="w-20 h-20 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-full flex items-center justify-center text-2xl transition-all transform hover:scale-105 disabled:cursor-not-allowed"
                    >
                      🎤
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="w-20 h-20 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-2xl transition-all animate-pulse"
                    >
                      ⏹️
                    </button>
                  )}
                </div>

                {/* Instructions and Controls */}
                <div className="text-center text-sm text-gray-600 max-w-md">
                  {isPlayingOpponentAudio && (
                    <div className="text-green-600 font-medium mb-2">
                      Your opponent is speaking. Listen carefully!
                    </div>
                  )}
                  {currentSpeaker !== studentName && !isPlayingOpponentAudio && (
                    <div className="text-orange-600 font-medium mb-2">
                      Waiting for {currentSpeaker}'s response... ({formatTime(timeRemaining)} remaining)
                    </div>
                  )}
                  {currentSpeaker === studentName && !isRecording && !isProcessing && !isPlayingOpponentAudio && (
                    <div>
                      <div className="text-green-600 font-medium mb-2">Your turn to speak!</div>
                      <div>Click the microphone to record your argument. You have {formatTime(timeRemaining)} remaining.</div>
                    </div>
                  )}
                  {isRecording && (
                    "Speak clearly into your microphone. Your opponent will hear you in real-time! Click stop when finished (max 30 seconds)."
                  )}
                  {isProcessing && (
                    "Converting speech to text and processing your argument..."
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleLeaveDebate}
                    className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                  >
                    Leave Debate
                  </button>
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