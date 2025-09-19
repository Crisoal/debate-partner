// ==================================================
// CLIENT/SRC/COMPONENTS/DASHBOARD.JS
// ==================================================

import React, { useState, useEffect } from 'react';
import { fetchDashboardData } from '../utils/api';

function Dashboard({ studentName, onBack }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (studentName) {
      loadDashboardData();
    }
  }, [studentName]);

  const loadDashboardData = async () => {
    try {
      const data = await fetchDashboardData(studentName);
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No data available for {studentName}</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Back to Topics
        </button>
      </div>
    );
  }

  const { sessions, totalDebates, totalArguments, performanceMetrics } = dashboardData;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">📊 Performance Dashboard</h2>
          <p className="text-gray-600 mt-1">Track your debate skills progress, {studentName}</p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
        >
          ← Back to Topics
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="text-3xl font-bold text-blue-600 mb-2">{totalDebates}</div>
          <div className="text-gray-600">Total Debates</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="text-3xl font-bold text-green-600 mb-2">{totalArguments}</div>
          <div className="text-gray-600">Arguments Made</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="text-3xl font-bold text-purple-600 mb-2">
            {performanceMetrics.averageScore || 0}
          </div>
          <div className="text-gray-600">Average Score</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className={`text-3xl font-bold mb-2 ${
            performanceMetrics.improvementTrend > 0 ? 'text-green-600' : 
            performanceMetrics.improvementTrend < 0 ? 'text-red-600' : 'text-gray-600'
          }`}>
            {performanceMetrics.improvementTrend > 0 ? '+' : ''}
            {performanceMetrics.improvementTrend || 0}
          </div>
          <div className="text-gray-600">Improvement Trend</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Debates */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">📝 Recent Debates</h3>
          {sessions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No debates yet. Start your first debate!</p>
          ) : (
            <div className="space-y-4">
              {sessions.slice(0, 5).map((session) => (
                <div key={session.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-gray-800 text-sm">{session.topic_title}</h4>
                    <span className="text-xs text-gray-500">
                      {new Date(session.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className={`px-2 py-1 rounded-full ${
                      session.student_position === 'for' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      Your position: {session.student_position}
                    </span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                      {session.message_count} arguments
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Common Fallacies */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">⚠️ Areas for Improvement</h3>
          {Object.keys(performanceMetrics.fallacyFrequency || {}).length === 0 ? (
            <p className="text-gray-500 text-center py-8">Great job! No common fallacies detected.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(performanceMetrics.fallacyFrequency || {})
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([fallacy, count]) => (
                  <div key={fallacy} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-800">{fallacy}</span>
                    <span className="text-sm text-red-600 bg-red-100 px-2 py-1 rounded-full">
                      {count} time{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Progress Tips */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 mt-8 text-white">
        <h3 className="text-xl font-semibold mb-4">💡 Tips for Improvement</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            • <strong>Use evidence:</strong> Support claims with credible sources and data
          </div>
          <div>
            • <strong>Address counterarguments:</strong> Acknowledge and refute opposing views
          </div>
          <div>
            • <strong>Question assumptions:</strong> Challenge underlying premises in arguments
          </div>
          <div>
            • <strong>Stay logical:</strong> Avoid emotional appeals and personal attacks
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;