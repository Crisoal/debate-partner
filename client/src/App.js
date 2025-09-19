// ==================================================
// CLIENT/SRC/APP.JS - Main React App
// ==================================================

import React, { useState } from 'react';
import TopicSelector from './components/TopicSelector';
import DebateArena from './components/DebateArena';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('topics'); // 'topics', 'debate', 'dashboard'
  const [debateSession, setDebateSession] = useState(null);
  const [studentName, setStudentName] = useState('');

  const handleStartDebate = (session) => {
    setDebateSession(session);
    setCurrentView('debate');
  };

  const handleEndDebate = () => {
    setDebateSession(null);
    setCurrentView('topics');
  };

  const handleViewDashboard = (name) => {
    setStudentName(name);
    setCurrentView('dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">🎭 Socratic AI Debate Partner</h1>
          <div className="space-x-4">
            <button 
              onClick={() => setCurrentView('topics')}
              className={`px-4 py-2 rounded transition-colors ${currentView === 'topics' ? 'bg-blue-800' : 'hover:bg-blue-700'}`}
            >
              📚 Topics
            </button>
            <button 
              onClick={() => setCurrentView('dashboard')}
              className={`px-4 py-2 rounded transition-colors ${currentView === 'dashboard' ? 'bg-blue-800' : 'hover:bg-blue-700'}`}
            >
              📊 Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {currentView === 'topics' && (
          <TopicSelector 
            onStartDebate={handleStartDebate} 
            onViewDashboard={handleViewDashboard}
          />
        )}
        
        {currentView === 'debate' && debateSession && (
          <DebateArena 
            session={debateSession}
            onEndDebate={handleEndDebate}
          />
        )}
        
        {currentView === 'dashboard' && (
          <Dashboard 
            studentName={studentName}
            onBack={() => setCurrentView('topics')}
          />
        )}
      </main>
    </div>
  );
}

export default App;