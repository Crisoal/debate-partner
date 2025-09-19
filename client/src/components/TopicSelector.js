// ==================================================
// CLIENT/SRC/COMPONENTS/TOPICSELECTOR.JS
// ==================================================

import React, { useState, useEffect } from 'react';
import { fetchTopics, startDebate } from '../utils/api';

function TopicSelector({ onStartDebate, onViewDashboard }) {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [position, setPosition] = useState('for');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const data = await fetchTopics();
      setTopics(data);
    } catch (error) {
      console.error('Failed to load topics:', error);
    }
  };

  const handleStartDebate = async () => {
    if (!selectedTopic || !studentName.trim()) {
      alert('Please select a topic and enter your name');
      return;
    }

    setLoading(true);
    try {
      const session = await startDebate({
        topicId: selectedTopic.id,
        studentPosition: position,
        studentName: studentName.trim()
      });
      onStartDebate(session);
    } catch (error) {
      console.error('Failed to start debate:', error);
      alert('Failed to start debate. Please try again.');
    } finally {
      setLoading(false);
      setShowModal(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-4">Choose Your Debate Topic</h2>
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

      {/* Topics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {topics.map((topic) => (
          <div
            key={topic.id}
            className={`bg-white rounded-lg shadow-md p-6 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
              selectedTopic?.id === topic.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
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
                  🎯 Start Debate
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Debate Setup Modal */}
      {showModal && selectedTopic && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">Setup Your Debate</h3>
            
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

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartDebate}
                disabled={loading || !studentName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Starting...' : 'Begin Debate! 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TopicSelector;