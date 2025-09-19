// ==================================================
// CLIENT/SRC/COMPONENTS/ARGUMENTANALYZER.JS
// ==================================================

import React from 'react';

function ArgumentAnalyzer({ analysis }) {
  if (!analysis) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          🔍 Argument Analysis
        </h3>
        <p className="text-gray-500 text-center py-8">
          Submit your first argument to see detailed analysis and feedback!
        </p>
      </div>
    );
  }

  const getScoreColor = (score) => {
    if (score >= 8) return 'text-green-600 bg-green-100';
    if (score >= 6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getQualityBadge = (quality) => {
    const colors = {
      excellent: 'bg-green-100 text-green-800',
      good: 'bg-blue-100 text-blue-800',
      fair: 'bg-yellow-100 text-yellow-800',
      poor: 'bg-red-100 text-red-800'
    };
    return colors[quality] || colors.fair;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h3 className="text-lg font-semibold text-gray-800 flex items-center">
        🔍 Argument Analysis
      </h3>

      {/* Overall Score */}
      <div className="text-center">
        <div className={`text-3xl font-bold px-4 py-2 rounded-full inline-block ${getScoreColor(analysis.score)}`}>
          {analysis.score}/10
        </div>
        <p className="text-sm text-gray-600 mt-2">Overall Argument Score</p>
      </div>

      {/* Quality Metrics */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Evidence Quality</span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getQualityBadge(analysis.evidenceQuality)}`}>
            {analysis.evidenceQuality}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Logical Consistency</span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getQualityBadge(analysis.logicalConsistency)}`}>
            {analysis.logicalConsistency}
          </span>
        </div>
      </div>

      {/* Strengths */}
      {analysis.strengths && analysis.strengths.length > 0 && (
        <div>
          <h4 className="font-semibold text-green-700 mb-2 flex items-center">
            ✅ Strengths
          </h4>
          <ul className="space-y-1">
            {analysis.strengths.map((strength, index) => (
              <li key={index} className="text-sm text-gray-700 bg-green-50 p-2 rounded">
                {strength}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Logical Fallacies */}
      {analysis.fallacies && analysis.fallacies.length > 0 && (
        <div>
          <h4 className="font-semibold text-red-700 mb-2 flex items-center">
            ⚠️ Logical Fallacies Detected
          </h4>
          <ul className="space-y-1">
            {analysis.fallacies.map((fallacy, index) => (
              <li key={index} className="text-sm text-gray-700 bg-red-50 p-2 rounded border-l-4 border-red-300">
                {fallacy}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {analysis.improvements && analysis.improvements.length > 0 && (
        <div>
          <h4 className="font-semibold text-blue-700 mb-2 flex items-center">
            💡 Suggestions for Improvement
          </h4>
          <ul className="space-y-1">
            {analysis.improvements.map((improvement, index) => (
              <li key={index} className="text-sm text-gray-700 bg-blue-50 p-2 rounded">
                {improvement}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ArgumentAnalyzer;