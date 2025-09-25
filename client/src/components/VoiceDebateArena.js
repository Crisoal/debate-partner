// ==================================================
// CLIENT/SRC/COMPONENTS/VOICEDEBATEARENA.JS
// ==================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { submitVoiceArgument } from '../utils/api';
import ArgumentAnalyzer from './ArgumentAnalyzer';

function VoiceDebateArena({ session, onEndDebate }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      speaker: 'ai',
      content: session.aiOpeningArgument,
      timestamp: new Date()
    }
  ]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const speechSynthesisRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Speak the AI's opening argument
    speakText(session.aiOpeningArgument);
    
    // Cleanup on unmount
    return () => {
      stopRecording();
      stopSpeaking();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      utterance.onstart = () => setIsAISpeaking(true);
      utterance.onend = () => setIsAISpeaking(false);
      utterance.onerror = () => setIsAISpeaking(false);
      
      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsAISpeaking(false);
    }
  };

  const startRecording = async () => {
    try {
      // Stop any ongoing AI speech
      stopSpeaking();
      
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
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = handleRecordingStop;
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      setTranscription('');
      
      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
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
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const handleRecordingStop = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    
    if (audioBlob.size < 1000) { // Less than 1KB
      alert('Recording too short. Please try again.');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const response = await submitVoiceArgument({
        sessionId: session.sessionId,
        audioBlob: audioBlob
      });
      
      const userMessage = {
        id: messages.length + 1,
        speaker: 'student',
        content: response.transcription,
        timestamp: new Date(),
        isVoice: true
      };
      
      const aiMessage = {
        id: messages.length + 2,
        speaker: 'ai',
        content: response.aiResponse,
        timestamp: new Date(),
        isVoice: true
      };
      
      setMessages(prev => [...prev, userMessage, aiMessage]);
      setLastAnalysis(response.analysis);
      setTranscription(response.transcription);
      
      // Speak AI response
      setTimeout(() => {
        speakText(response.aiResponse);
      }, 500);
      
    } catch (error) {
      console.error('Failed to process voice argument:', error);
      alert('Failed to process your argument. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center">
              🎤 {session.topic.title} - Voice Debate
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
        {/* Voice Interface */}
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
                      {message.isVoice && (
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                          🎤 Voice
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
              
              {isProcessing && (
                <div className="flex justify-center">
                  <div className="bg-yellow-100 text-yellow-800 border border-yellow-200 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-600"></div>
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

                {/* AI Speaking Status */}
                {isAISpeaking && (
                  <div className="text-center">
                    <div className="text-blue-600 font-semibold text-lg mb-2">
                      🗣️ AI is speaking...
                    </div>
                    <button
                      onClick={stopSpeaking}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                    >
                      Stop Speaking
                    </button>
                  </div>
                )}

                {/* Transcription Preview */}
                {transcription && (
                  <div className="w-full p-3 bg-gray-50 rounded-lg border">
                    <div className="text-sm text-gray-600 mb-1">Last transcription:</div>
                    <div className="text-gray-800">{transcription}</div>
                  </div>
                )}

                {/* Voice Button */}
                <div className="flex gap-4 items-center">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={isProcessing || isAISpeaking}
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

                {/* Instructions */}
                <div className="text-center text-sm text-gray-600 max-w-md">
                  {!isRecording && !isProcessing && !isAISpeaking && (
                    "Click the microphone to start recording your argument. The AI will respond with voice."
                  )}
                  {isRecording && (
                    "Speak clearly into your microphone. Click stop when finished (max 30 seconds)."
                  )}
                  {isProcessing && (
                    "Converting speech to text and analyzing your argument..."
                  )}
                  {isAISpeaking && (
                    "Listen to the AI's response, then record your counter-argument."
                  )}
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

export default VoiceDebateArena;