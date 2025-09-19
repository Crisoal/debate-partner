// ==================================================
// 2. SERVER.JS - Backend API Server (Updated for AI/ML API)
// ==================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios'); // For making HTTP requests to AI/ML API
require('dotenv').config();

const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/socratic_debate'
});

// AI/ML API configuration
const AI_ML_API_CONFIG = {
    baseURL: process.env.AIML_API_URL || 'https://api.aimlapi.com/v1/chat/completions',
    apiKey: process.env.AIML_API_KEY,
    model: process.env.AIML_MODEL || 'gpt-4o-mini', // Default model
    headers: {
        'Authorization': `Bearer ${process.env.AIML_API_KEY}`,
        'Content-Type': 'application/json'
    }
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Trust proxy for rate limiting (fixes the warning)
app.set('trust proxy', 1);


// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);

// DEBATE TOPICS DATA
const DEBATE_TOPICS = [
    {
        id: 1,
        title: "Social Media should be regulated like tobacco",
        description: "Should governments regulate social media platforms similar to tobacco products?",
        category: "Technology & Society"
    },
    {
        id: 2,
        title: "Universal Basic Income is necessary for the future",
        description: "Should governments implement Universal Basic Income programs?",
        category: "Economics"
    },
    {
        id: 3,
        title: "AI will create more jobs than it destroys",
        description: "Will artificial intelligence ultimately benefit or harm employment?",
        category: "Technology & Future"
    },
    {
        id: 4,
        title: "Climate change requires immediate radical action",
        description: "Should governments implement extreme measures to combat climate change?",
        category: "Environment"
    },
    {
        id: 5,
        title: "Online education is superior to traditional classroom learning",
        description: "Is digital learning more effective than in-person education?",
        category: "Education"
    }
];

// Helper function to extract JSON from markdown code blocks
function extractJSONFromResponse(response) {
  if (typeof response !== 'string') {
    return response;
  }
  
  // Remove markdown code block markers
  let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  
  // Try to find JSON object in the response
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}') + 1;
  
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd);
  }
  
  return cleaned.trim();
}

// Helper function to safely parse JSON
function safeJSONParse(jsonString, fallback) {
  try {
    const extracted = extractJSONFromResponse(jsonString);
    return JSON.parse(extracted);
  } catch (error) {
    console.warn('Failed to parse JSON:', error.message);
    console.warn('Original response:', jsonString);
    return fallback;
  }
}

// API ROUTES

// Get available debate topics
app.get('/api/topics', (req, res) => {
    res.json(DEBATE_TOPICS);
});

// Start a new debate session
app.post('/api/debate/start', async (req, res) => {
    try {
        const { topicId, studentPosition, studentName } = req.body;

        const topic = DEBATE_TOPICS.find(t => t.id === topicId);
        if (!topic) {
            return res.status(404).json({ error: 'Topic not found' });
        }

        // Create debate session in database
        const result = await pool.query(
            `INSERT INTO debate_sessions (topic_id, topic_title, student_position, student_name, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, created_at`,
            [topicId, topic.title, studentPosition, studentName]
        );

        const sessionId = result.rows[0].id;

        // Generate AI's opening argument
        const aiPosition = studentPosition === 'for' ? 'against' : 'for';
        const aiResponse = await generateAIArgument(topic, aiPosition, [], 'opening');

        // Store AI's opening argument
        await pool.query(
            `INSERT INTO debate_messages (session_id, speaker, content, message_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
            [sessionId, 'ai', aiResponse, 'argument']
        );

        res.json({
            sessionId,
            topic: topic,
            studentPosition,
            aiPosition,
            aiOpeningArgument: aiResponse,
            createdAt: result.rows[0].created_at
        });

    } catch (error) {
        console.error('Error starting debate:', error);
        res.status(500).json({ error: 'Failed to start debate session' });
    }
});

// Submit student argument and get AI response
app.post('/api/debate/argument', async (req, res) => {
    try {
        const { sessionId, argument } = req.body;

        // Get session details
        const sessionResult = await pool.query(
            'SELECT * FROM debate_sessions WHERE id = $1',
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Debate session not found' });
        }

        const session = sessionResult.rows[0];
        const topic = DEBATE_TOPICS.find(t => t.id === session.topic_id);

        // Store student's argument
        await pool.query(
            `INSERT INTO debate_messages (session_id, speaker, content, message_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
            [sessionId, 'student', argument, 'argument']
        );

        // Get conversation history
        const historyResult = await pool.query(
            `SELECT speaker, content FROM debate_messages 
       WHERE session_id = $1 ORDER BY created_at ASC`,
            [sessionId]
        );

        // Analyze student's argument for fallacies and weaknesses
        const analysis = await analyzeArgument(argument, topic);

        // Generate AI counter-argument
        const aiPosition = session.student_position === 'for' ? 'against' : 'for';
        const aiResponse = await generateAIArgument(
            topic,
            aiPosition,
            historyResult.rows,
            'counter',
            argument
        );

        // Store AI's response
        await pool.query(
            `INSERT INTO debate_messages (session_id, speaker, content, message_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
            [sessionId, 'ai', aiResponse, 'argument']
        );

        // Store argument analysis - ensure it's stored as JSON string
        await pool.query(
            `INSERT INTO argument_analyses (session_id, argument_text, analysis_result, created_at)
       VALUES ($1, $2, $3, NOW())`,
            [sessionId, argument, JSON.stringify(analysis)]
        );

        res.json({
            aiResponse,
            analysis
        });

    } catch (error) {
        console.error('Error processing argument:', error);
        res.status(500).json({ error: 'Failed to process argument' });
    }
});

// Get student performance dashboard
app.get('/api/dashboard/:studentName', async (req, res) => {
    try {
        const { studentName } = req.params;

        // Get debate sessions
        const sessionsResult = await pool.query(
            `SELECT ds.*, COUNT(dm.id) as message_count
       FROM debate_sessions ds
       LEFT JOIN debate_messages dm ON ds.id = dm.session_id AND dm.speaker = 'student'
       WHERE ds.student_name = $1
       GROUP BY ds.id
       ORDER BY ds.created_at DESC`,
            [studentName]
        );

        // Get argument analyses with safe JSON parsing
        const analysesResult = await pool.query(
            `SELECT aa.analysis_result, aa.created_at
       FROM argument_analyses aa
       JOIN debate_sessions ds ON aa.session_id = ds.id
       WHERE ds.student_name = $1
       ORDER BY aa.created_at DESC`,
            [studentName]
        );

        // Safely parse analysis results
        const analyses = analysesResult.rows.map(row => {
            try {
                // Check if analysis_result is already an object
                if (typeof row.analysis_result === 'object' && row.analysis_result !== null) {
                    return row.analysis_result;
                }
                // Try to parse as JSON string
                return JSON.parse(row.analysis_result);
            } catch (error) {
                console.warn('Failed to parse analysis result:', error.message);
                // Return fallback analysis
                return {
                    score: 5,
                    strengths: ["Analysis data corrupted"],
                    fallacies: [],
                    improvements: ["Data needs to be re-analyzed"],
                    evidenceQuality: "fair",
                    logicalConsistency: "fair"
                };
            }
        });

        // Calculate performance metrics
        const metrics = calculatePerformanceMetrics(analyses);

        res.json({
            sessions: sessionsResult.rows,
            totalDebates: sessionsResult.rows.length,
            totalArguments: analysesResult.rows.length,
            performanceMetrics: metrics,
            recentAnalyses: analyses.slice(0, 10)
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// AI FUNCTIONS - Updated for AI/ML API

async function callAIMLAPI(messages, maxTokens = 500, temperature = 0.7) {
    try {
        const requestBody = {
            model: AI_ML_API_CONFIG.model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature,
            stream: false
        };

        const response = await axios.post(AI_ML_API_CONFIG.baseURL, requestBody, {
            headers: AI_ML_API_CONFIG.headers,
            timeout: 30000 // 30 seconds timeout
        });

        if (response.data && response.data.choices && response.data.choices[0]) {
            return response.data.choices[0].message.content;
        } else {
            throw new Error('Invalid response format from AI/ML API');
        }

    } catch (error) {
        console.error('AI/ML API Error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        throw error;
    }
}

async function generateAIArgument(topic, position, conversationHistory, type, lastStudentArgument = '') {
    try {
        const systemPrompt = `You are a skilled debate partner using the Socratic method. You are arguing ${position} the topic: "${topic.title}".

Your role is to:
1. Present logical, well-reasoned arguments
2. Challenge assumptions thoughtfully
3. Ask probing questions
4. Maintain a respectful but intellectually rigorous tone
5. Adapt your arguments based on the conversation flow

Keep responses concise (2-3 paragraphs max) but substantive.`;

        let userPrompt = '';

        if (type === 'opening') {
            userPrompt = `Present your opening argument ${position} the proposition: "${topic.title}". 
      Make it engaging and thought-provoking.`;
        } else {
            userPrompt = `The student just argued: "${lastStudentArgument}"
      
      Previous conversation:
      ${conversationHistory.map(msg => `${msg.speaker}: ${msg.content}`).join('\n')}
      
      Provide a thoughtful counter-argument that challenges their reasoning while maintaining the Socratic method.`;
        }

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        return await callAIMLAPI(messages, 500, 0.7);

    } catch (error) {
        console.error('Error generating AI argument:', error);
        return "I'm having trouble formulating my response right now. Could you please rephrase your argument?";
    }
}

async function analyzeArgument(argument, topic) {
    try {
        const systemPrompt = `You are an expert in logic, critical thinking, and argumentation. Analyze the given argument for:

1. Logical fallacies (name them specifically)
2. Evidence quality and sources
3. Reasoning strength
4. Areas for improvement
5. Overall argument score (1-10)

IMPORTANT: Return ONLY valid JSON without any markdown formatting or code blocks.`;

        const userPrompt = `Analyze this argument about "${topic.title}":

"${argument}"

Return analysis in this exact JSON format (no markdown, no code blocks):
{
  "score": 7,
  "strengths": ["strength1", "strength2"],
  "fallacies": ["fallacy1", "fallacy2"],
  "improvements": ["suggestion1", "suggestion2"],
  "evidenceQuality": "fair",
  "logicalConsistency": "good"
}`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        const response = await callAIMLAPI(messages, 400, 0.3);

        // Use safe JSON parsing with fallback
        const fallbackAnalysis = {
            score: 6,
            strengths: ["Presented a clear position"],
            fallacies: [],
            improvements: ["Could benefit from more evidence", "Consider addressing counterarguments"],
            evidenceQuality: "fair",
            logicalConsistency: "fair"
        };

        return safeJSONParse(response, fallbackAnalysis);

    } catch (error) {
        console.error('Error analyzing argument:', error);
        return {
            score: 5,
            strengths: ["Presented a clear position"],
            fallacies: [],
            improvements: ["Could benefit from more evidence", "Consider addressing counterarguments"],
            evidenceQuality: "fair",
            logicalConsistency: "fair"
        };
    }
}

function calculatePerformanceMetrics(analyses) {
    if (analyses.length === 0) {
        return {
            averageScore: 0,
            improvementTrend: 0,
            fallacyFrequency: {},
            strengthAreas: [],
            weaknessAreas: []
        };
    }

    const scores = analyses.map(a => a.score);
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    // Calculate improvement trend (recent vs older arguments)
    const recentScores = scores.slice(0, Math.ceil(scores.length / 2));
    const olderScores = scores.slice(Math.ceil(scores.length / 2));
    const recentAvg = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
    const olderAvg = olderScores.length > 0 ? olderScores.reduce((sum, score) => sum + score, 0) / olderScores.length : recentAvg;
    const improvementTrend = recentAvg - olderAvg;

    // Analyze fallacies
    const fallacyFrequency = {};
    analyses.forEach(analysis => {
        if (analysis.fallacies) {
            analysis.fallacies.forEach(fallacy => {
                fallacyFrequency[fallacy] = (fallacyFrequency[fallacy] || 0) + 1;
            });
        }
    });

    return {
        averageScore: Math.round(averageScore * 10) / 10,
        improvementTrend: Math.round(improvementTrend * 10) / 10,
        fallacyFrequency,
        totalArguments: analyses.length
    };
}

// DATABASE INITIALIZATION
async function initializeDatabase() {
    try {
        // Create tables
        await pool.query(`
      CREATE TABLE IF NOT EXISTS debate_sessions (
        id SERIAL PRIMARY KEY,
        topic_id INTEGER NOT NULL,
        topic_title VARCHAR(255) NOT NULL,
        student_position VARCHAR(10) NOT NULL,
        student_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS debate_messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES debate_sessions(id),
        speaker VARCHAR(10) NOT NULL,
        content TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'argument',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS argument_analyses (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES debate_sessions(id),
        argument_text TEXT NOT NULL,
        analysis_result JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
    }
}

// Health check endpoint for AI/ML API connection
app.get('/api/health/ai', async (req, res) => {
    try {
        const testMessages = [
            { role: "user", content: "Say 'AI/ML API is working'" }
        ];

        const response = await callAIMLAPI(testMessages, 50, 0.1);

        res.json({
            status: 'connected',
            apiUrl: AI_ML_API_CONFIG.baseURL,
            model: AI_ML_API_CONFIG.model,
            testResponse: response
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            apiUrl: AI_ML_API_CONFIG.baseURL
        });
    }
});

// Initialize database and start server
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`AI/ML API URL: ${AI_ML_API_CONFIG.baseURL}`);
        console.log(`AI/ML Model: ${AI_ML_API_CONFIG.model}`);
    });
});