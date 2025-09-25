// ==================================================
// CLIENT/SRC/APP.JS - Updated with Voice and Peer Debate Support
// ==================================================
import React, { useState } from 'react';
import TopicSelector from './components/TopicSelector';
import DebateArena from './components/DebateArena';
import VoiceDebateArena from './components/VoiceDebateArena';
import PeerDebateArena from './components/PeerDebateArena';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('topics');
  const [debateSession, setDebateSession] = useState(null);
  const [studentName, setStudentName] = useState(''); // This should be set when starting peer debate

  const handleStartDebate = (session) => {
    setDebateSession(session);
    setCurrentView('debate');
  };

  const handleStartVoiceDebate = (session) => {
    setDebateSession(session);
    setCurrentView('voice-debate');
  };

  const handleStartPeerDebate = (session) => {
    console.log('Starting peer debate with session:', session);
    
    // Ensure we have the student name from the session
    if (session.studentName) {
      setStudentName(session.studentName);
    }
    
    setDebateSession(session);
    setCurrentView('peer-debate');
  };

  const handleEndDebate = () => {
    setDebateSession(null);
    setCurrentView('topics');
    // Don't clear studentName here - keep it for dashboard access
  };

  const handleViewDashboard = (name) => {
    setStudentName(name);
    setCurrentView('dashboard');
  };

  const getNavTitle = () => {
    switch (currentView) {
      case 'voice-debate':
        return '🎤 Voice Debate Active';
      case 'peer-debate':
        return '🤝 Peer Debate Active';
      case 'debate':
        return '💬 AI Debate Active';
      case 'dashboard':
        return `📊 ${studentName}'s Dashboard`;
      default:
        return '🎭 Socratic AI';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">{getNavTitle()}</h1>
          <div className="space-x-4">
            <button 
              onClick={() => setCurrentView('topics')}
              className={`px-4 py-2 rounded transition-colors ${currentView === 'topics' ? 'bg-blue-800' : 'hover:bg-blue-700'}`}
              disabled={currentView.includes('debate')}
            >
              📚 Topics
            </button>
            <button 
              onClick={() => setCurrentView('dashboard')}
              className={`px-4 py-2 rounded transition-colors ${currentView === 'dashboard' ? 'bg-blue-800' : 'hover:bg-blue-700'}`}
              disabled={currentView.includes('debate') || !studentName}
            >
              📊 Dashboard
            </button>
            {currentView.includes('debate') && (
              <button
                onClick={handleEndDebate}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                End Debate
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {currentView === 'topics' && (
          <TopicSelector 
            onStartDebate={handleStartDebate}
            onStartVoiceDebate={handleStartVoiceDebate}
            onStartPeerDebate={handleStartPeerDebate}
            onViewDashboard={handleViewDashboard}
          />
        )}
        
        {currentView === 'debate' && debateSession && (
          <DebateArena 
            session={debateSession}
            onEndDebate={handleEndDebate}
          />
        )}

        {currentView === 'voice-debate' && debateSession && (
          <VoiceDebateArena 
            session={debateSession}
            onEndDebate={handleEndDebate}
          />
        )}

        {currentView === 'peer-debate' && debateSession && studentName && (
          <PeerDebateArena 
            session={debateSession}
            onEndDebate={handleEndDebate}
            studentName={studentName}
          />
        )}
        
        {currentView === 'dashboard' && studentName && (
          <Dashboard 
            studentName={studentName}
            onBack={() => setCurrentView('topics')}
          />
        )}

        {/* Error states */}
        {currentView === 'peer-debate' && (!debateSession || !studentName) && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-red-800 mb-4">Error Loading Peer Debate</h2>
              <p className="text-red-600 mb-6">
                Missing required session or student information. Please try starting a new debate.
              </p>
              <button
                onClick={() => setCurrentView('topics')}
                className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Return to Topics
              </button>
            </div>
          </div>
        )}

        {currentView === 'dashboard' && !studentName && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-yellow-800 mb-4">No Student Selected</h2>
              <p className="text-yellow-600 mb-6">
                Please enter your name and start a debate first to view your dashboard.
              </p>
              <button
                onClick={() => setCurrentView('topics')}
                className="px-6 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
              >
                Go to Topics
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;