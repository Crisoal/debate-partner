// ==================================================
// SERVER.JS - Complete Backend API Server with Voice and Peer Debate Features
// ==================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();
const speech = require('@google-cloud/speech');

const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/socratic_debate'
});

const AI_ML_API_CONFIG = {
  baseURL: process.env.AIML_API_URL || 'https://api.aimlapi.com/v1/chat/completions',
  apiKey: process.env.AIML_API_KEY,
  model: process.env.AIML_MODEL || 'gpt-4o-mini',
  headers: {
    'Authorization': `Bearer ${process.env.AIML_API_KEY}`,
    'Content-Type': 'application/json'
  }
};

const speechClient = new speech.SpeechClient();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/audio/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Created upload directory:', uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname) || '.webm';
    cb(null, `audio-${uniqueSuffix}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  console.log('File filter - mimetype:', file.mimetype);
  console.log('File filter - originalname:', file.originalname);

  const allowedMimeTypes = [
    'audio/webm',
    'audio/wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/x-wav',
    'audio/vnd.wav',
    'audio/mp3',
    'video/webm'
  ];

  if (allowedMimeTypes.includes(file.mimetype) || file.originalname.endsWith('.webm')) {
    cb(null, true);
  } else {
    console.error('Invalid file type:', file.mimetype);
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    fieldSize: 100 * 1024 * 1024
  },
  fileFilter: fileFilter
});

const handleMulterErrors = (error, req, res, next) => {
  console.error('Multer error:', error);

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'File too large',
          details: 'Audio file must be smaller than 25MB',
          code: 'FILE_TOO_LARGE'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected field name',
          details: 'Expected field name: "audio"',
          code: 'UNEXPECTED_FIELD'
        });
      default:
        return res.status(400).json({
          error: 'File upload error',
          details: error.message,
          code: error.code
        });
    }
  } else if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      details: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }

  next(error);
};

const peerDebateRooms = new Map();
const waitingPlayers = new Map();
const activeConnections = new Map();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

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

function extractJSONFromResponse(response) {
  if (typeof response !== 'string') {
    return response;
  }

  let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}') + 1;

  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd);
  }

  return cleaned.trim();
}

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

app.use('/api/debate/voice-argument', (req, res, next) => {
  console.log('=== Voice Argument Request Debug ===');
  console.log('Method:', req.method);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Content-Length:', req.headers['content-length']);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('Body keys (before multer):', Object.keys(req.body || {}));
  next();
});

app.get('/api/topics', (req, res) => {
  res.json(DEBATE_TOPICS);
});

app.post('/api/debate/start', async (req, res) => {
  try {
    const { topicId, studentPosition, studentName } = req.body;

    const topic = DEBATE_TOPICS.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const result = await pool.query(
      `INSERT INTO debate_sessions (topic_id, topic_title, student_position, student_name, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, created_at`,
      [topicId, topic.title, studentPosition, studentName]
    );

    const sessionId = result.rows[0].id;

    const aiPosition = studentPosition === 'for' ? 'against' : 'for';
    const aiResponse = await generateAIArgument(topic, aiPosition, [], 'opening');

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

app.post('/api/debate/argument', async (req, res) => {
  try {
    const { sessionId, argument } = req.body;

    const sessionResult = await pool.query(
      'SELECT * FROM debate_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Debate session not found' });
    }

    const session = sessionResult.rows[0];
    const topic = DEBATE_TOPICS.find(t => t.id === session.topic_id);

    await pool.query(
      `INSERT INTO debate_messages (session_id, speaker, content, message_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [sessionId, 'student', argument, 'argument']
    );

    const historyResult = await pool.query(
      `SELECT speaker, content FROM debate_messages 
       WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );

    const analysis = await analyzeArgument(argument, topic);

    const aiPosition = session.student_position === 'for' ? 'against' : 'for';
    const aiResponse = await generateAIArgument(
      topic,
      aiPosition,
      historyResult.rows,
      'counter',
      argument
    );

    await pool.query(
      `INSERT INTO debate_messages (session_id, speaker, content, message_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [sessionId, 'ai', aiResponse, 'argument']
    );

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

app.post('/api/debate/voice/start', async (req, res) => {
  try {
    const { topicId, studentPosition, studentName } = req.body;

    const topic = DEBATE_TOPICS.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const result = await pool.query(
      `INSERT INTO debate_sessions (topic_id, topic_title, student_position, student_name, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, created_at`,
      [topicId, topic.title, studentPosition, studentName]
    );

    const sessionId = result.rows[0].id;

    await pool.query(
      `INSERT INTO voice_debate_sessions (session_id) VALUES ($1)`,
      [sessionId]
    );

    const aiPosition = studentPosition === 'for' ? 'against' : 'for';
    const aiResponse = await generateAIArgument(topic, aiPosition, [], 'opening');

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
    console.error('Error starting voice debate:', error);
    res.status(500).json({ error: 'Failed to start voice debate session' });
  }
});

app.post('/api/debate/voice-argument',
  upload.single('audio'),
  handleMulterErrors,
  async (req, res) => {
    console.log('=== Voice Argument Processing Start ===');

    try {
      const { sessionId } = req.body;
      const audioFile = req.file;

      console.log('Session ID:', sessionId);
      console.log('Body after multer:', req.body);
      console.log('Audio file info:', audioFile ? {
        originalname: audioFile.originalname,
        filename: audioFile.filename,
        mimetype: audioFile.mimetype,
        size: audioFile.size,
        path: audioFile.path
      } : 'No file received');

      if (!sessionId) {
        console.error('Missing sessionId');
        return res.status(400).json({
          error: 'Missing sessionId',
          code: 'MISSING_SESSION_ID'
        });
      }

      if (!audioFile) {
        console.error('No audio file provided');
        return res.status(400).json({
          error: 'No audio file provided',
          details: 'Expected multipart form data with "audio" field',
          code: 'MISSING_AUDIO_FILE'
        });
      }

      if (audioFile.size < 1000) {
        console.error('Audio file too small:', audioFile.size);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(400).json({
          error: 'Audio file too small',
          details: 'Audio file must be at least 1KB',
          code: 'FILE_TOO_SMALL'
        });
      }

      const sessionResult = await pool.query(
        'SELECT * FROM debate_sessions WHERE id = $1',
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        console.error('Debate session not found:', sessionId);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(404).json({
          error: 'Debate session not found',
          code: 'SESSION_NOT_FOUND'
        });
      }

      const session = sessionResult.rows[0];
      const topic = DEBATE_TOPICS.find(t => t.id === session.topic_id);

      console.log('Found session:', session.id, 'for topic:', topic?.title);

      console.log('Starting audio transcription...');
      let transcription;

      try {
        transcription = await transcribeAudio(audioFile.path);
        console.log('Transcription result:', transcription ? `"${transcription.substring(0, 100)}..."` : 'null');
      } catch (transcriptionError) {
        console.error('Transcription failed:', transcriptionError);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(500).json({
          error: 'Audio transcription failed',
          details: 'Unable to convert speech to text. Please speak clearly and try again.',
          code: 'TRANSCRIPTION_FAILED'
        });
      }

      if (!transcription || transcription.trim().length < 10) {
        console.error('Transcription too short or empty:', transcription);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(400).json({
          error: 'Could not transcribe audio',
          details: 'Audio was too short, unclear, or contained no speech. Please speak clearly for at least 3 seconds.',
          code: 'TRANSCRIPTION_TOO_SHORT'
        });
      }

      console.log('Storing transcription in database...');

      await pool.query(
        `INSERT INTO audio_transcriptions (session_id, audio_file_path, transcription, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [sessionId, audioFile.path, transcription]
      );

      await pool.query(
        `INSERT INTO debate_messages (session_id, speaker, content, message_type, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [sessionId, 'student', transcription, 'argument']
      );

      const historyResult = await pool.query(
        `SELECT speaker, content FROM debate_messages 
         WHERE session_id = $1 ORDER BY created_at ASC`,
        [sessionId]
      );

      console.log('Analyzing argument...');

      const analysis = await analyzeArgument(transcription, topic);

      console.log('Generating AI response...');

      const aiPosition = session.student_position === 'for' ? 'against' : 'for';
      const aiResponse = await generateAIArgument(
        topic,
        aiPosition,
        historyResult.rows,
        'counter',
        transcription
      );

      await pool.query(
        `INSERT INTO debate_messages (session_id, speaker, content, message_type, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [sessionId, 'ai', aiResponse, 'argument']
      );

      await pool.query(
        `INSERT INTO argument_analyses (session_id, argument_text, analysis_result, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [sessionId, transcription, JSON.stringify(analysis)]
      );

      await pool.query(
        `UPDATE voice_debate_sessions 
         SET audio_count = audio_count + 1 
         WHERE session_id = $1`,
        [sessionId]
      );

      setTimeout(() => {
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
          console.log('Cleaned up audio file:', audioFile.path);
        }
      }, 60000);

      console.log('Voice argument processing completed successfully');

      res.json({
        transcription,
        aiResponse,
        analysis,
        audioInfo: {
          size: audioFile.size,
          duration: Math.round(audioFile.size / 16000),
          filename: audioFile.filename
        }
      });

    } catch (error) {
      console.error('Error processing voice argument:', error);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        error: 'Failed to process voice argument',
        details: error.message,
        code: 'PROCESSING_FAILED'
      });
    }
  }
);

app.post('/api/debate/peer/start', async (req, res) => {
  try {
    const { topicId, studentName, studentPosition, timePerTurn = 120, totalRounds = 3 } = req.body;

    const topic = DEBATE_TOPICS.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    console.log(`Student ${studentName} (${studentPosition}) looking for match on topic ${topicId}`);

    let matchFound = false;
    let matchedPlayer = null;
    let matchedKey = null;

    for (let [key, player] of waitingPlayers.entries()) {
      const [playerTopicId, playerPosition] = key.split('-');

      if (parseInt(playerTopicId) === topicId &&
        player.studentPosition !== studentPosition) {
        matchFound = true;
        matchedPlayer = player;
        matchedKey = key;
        break;
      }
    }

    if (matchFound && matchedPlayer) {
      console.log(`Match found! ${studentName} vs ${matchedPlayer.studentName}`);

      waitingPlayers.delete(matchedKey);

      const sessionResult = await pool.query(
        `INSERT INTO peer_debate_sessions (topic_id, topic_title, time_per_turn, total_rounds, current_speaker, state)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id`,
        [topicId, topic.title, timePerTurn, totalRounds, studentName]
      );

      const sessionId = sessionResult.rows[0].id;

      await pool.query(
        `INSERT INTO peer_debate_participants (session_id, student_name, position)
         VALUES ($1, $2, $3), ($1, $4, $5)`,
        [sessionId, studentName, studentPosition, matchedPlayer.studentName, matchedPlayer.studentPosition]
      );

      const participants = [
        { name: studentName, position: studentPosition },
        { name: matchedPlayer.studentName, position: matchedPlayer.studentPosition }
      ];

      if (matchedPlayer.ws && matchedPlayer.ws.readyState === WebSocket.OPEN) {
        matchedPlayer.ws.send(JSON.stringify({
          type: 'match_found',
          sessionId,
          topic,
          participants,
          currentSpeaker: studentName,
          timePerTurn,
          totalRounds,
          studentName: matchedPlayer.studentName,
          studentPosition: matchedPlayer.studentPosition
        }));
      }

      res.json({
        sessionId,
        topic,
        participants,
        currentSpeaker: studentName,
        timePerTurn,
        totalRounds,
        currentRound: 1,
        state: 'active',
        studentName,
        studentPosition
      });

    } else {
      console.log(`No match found for ${studentName}. Adding to waiting list.`);

      const waitingKey = `${topicId}-${studentPosition}`;

      for (let [key, player] of waitingPlayers.entries()) {
        if (player.studentName === studentName) {
          waitingPlayers.delete(key);
          break;
        }
      }

      waitingPlayers.set(waitingKey, {
        studentName,
        studentPosition,
        topicId,
        timestamp: Date.now(),
        ws: null
      });

      console.log(`Added ${studentName} to waiting list. Current waiting:`, Array.from(waitingPlayers.keys()));

      res.json({
        sessionId: null,
        state: 'waiting',
        message: 'Waiting for opponent...',
        topic,
        studentName,
        studentPosition,
        timePerTurn,
        totalRounds
      });
    }

  } catch (error) {
    console.error('Error starting peer debate:', error);
    res.status(500).json({ error: 'Failed to start peer debate' });
  }
});

app.post('/api/debate/peer/argument', async (req, res) => {
  try {
    const { sessionId, argument, studentName } = req.body;

    const sessionResult = await pool.query(
      `SELECT pds.*, pd.topic_title FROM peer_debate_sessions pds
       JOIN debate_topics ON pds.topic_id = debate_topics.id
       WHERE pds.id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Peer debate session not found' });
    }

    const session = sessionResult.rows[0];

    if (session.current_speaker !== studentName) {
      return res.status(400).json({ error: 'Not your turn to speak' });
    }

    const topic = DEBATE_TOPICS.find(t => t.id === session.topic_id);

    await pool.query(
      `INSERT INTO peer_debate_messages (session_id, speaker, content, round_number, is_voice, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sessionId, studentName, argument, session.current_round, false]
    );

    const participantsResult = await pool.query(
      `SELECT student_name, position FROM peer_debate_participants 
       WHERE session_id = $1 AND left_at IS NULL`,
      [sessionId]
    );

    const participants = participantsResult.rows;
    const opponent = participants.find(p => p.student_name !== studentName);

    const moderatorFeedback = await generateModeratorFeedback(argument, topic, session.current_round);

    let nextSpeaker = opponent.student_name;
    let currentRound = session.current_round;
    let sessionState = 'active';

    const roundMessages = await pool.query(
      `SELECT COUNT(*) as count FROM peer_debate_messages 
       WHERE session_id = $1 AND round_number = $2`,
      [sessionId, currentRound]
    );

    if (roundMessages.rows[0].count >= 2) {
      if (currentRound >= session.total_rounds) {
        sessionState = 'finished';
        const finalAnalysis = await generateFinalAnalysis(sessionId, participants);

        await pool.query(
          `UPDATE peer_debate_sessions SET state = 'finished', ended_at = NOW() WHERE id = $1`,
          [sessionId]
        );

        broadcastToRoom(sessionId, {
          type: 'debate_ended',
          analysis: finalAnalysis
        });

        return res.json({
          moderatorComment: moderatorFeedback.comment,
          feedback: moderatorFeedback,
          finalAnalysis,
          debateComplete: true
        });

      } else {
        currentRound += 1;
        nextSpeaker = studentName;
      }
    }

    await pool.query(
      `UPDATE peer_debate_sessions 
       SET current_speaker = $1, current_round = $2, state = $3 
       WHERE id = $4`,
      [nextSpeaker, currentRound, sessionState, sessionId]
    );

    broadcastToRoom(sessionId, {
      type: 'new_message',
      message: {
        id: Date.now(),
        speaker: studentName,
        content: argument,
        timestamp: new Date(),
        round: session.current_round,
        isVoice: false
      }
    });

    broadcastToRoom(sessionId, {
      type: 'state_update',
      currentSpeaker: nextSpeaker,
      currentRound: currentRound,
      timeRemaining: session.time_per_turn,
      state: sessionState
    });

    if (moderatorFeedback.comment) {
      broadcastToRoom(sessionId, {
        type: 'new_message',
        message: {
          id: Date.now() + 1,
          speaker: 'moderator',
          content: moderatorFeedback.comment,
          timestamp: new Date(),
          isModerator: true
        }
      });
    }

    res.json({
      moderatorComment: moderatorFeedback.comment,
      feedback: moderatorFeedback
    });

  } catch (error) {
    console.error('Error processing peer argument:', error);
    res.status(500).json({ error: 'Failed to process peer argument' });
  }
});

// Enhanced error handling and turn management for peer voice arguments
app.post('/api/debate/peer/voice-argument',
  upload.single('audio'),
  handleMulterErrors,
  async (req, res) => {
    console.log('=== Peer Voice Argument Processing Start ===');

    try {
      const { sessionId, studentName } = req.body;
      const audioFile = req.file;

      console.log('Session ID:', sessionId);
      console.log('Student Name:', studentName);
      console.log('Audio file info:', audioFile ? {
        originalname: audioFile.originalname,
        filename: audioFile.filename,
        mimetype: audioFile.mimetype,
        size: audioFile.size
      } : 'No file received');

      if (!sessionId || !studentName) {
        return res.status(400).json({
          error: 'Missing required fields',
          code: 'MISSING_FIELDS'
        });
      }

      if (!audioFile) {
        return res.status(400).json({
          error: 'No audio file provided',
          code: 'MISSING_AUDIO_FILE'
        });
      }

      // Get session info with better error handling
      const sessionResult = await pool.query(
        `SELECT pds.*, COUNT(pdp.id) as participant_count 
         FROM peer_debate_sessions pds
         LEFT JOIN peer_debate_participants pdp ON pds.id = pdp.session_id
         WHERE pds.id = $1 AND pds.state = 'active'
         GROUP BY pds.id`,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        console.error('Peer debate session not found or inactive:', sessionId);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(404).json({
          error: 'Peer debate session not found or inactive',
          code: 'SESSION_NOT_FOUND'
        });
      }

      const session = sessionResult.rows[0];
      const topic = DEBATE_TOPICS.find(t => t.id === session.topic_id);

      // Check if it's the student's turn with better error message
      if (session.current_speaker !== studentName) {
        console.log(`Turn check failed: current_speaker=${session.current_speaker}, studentName=${studentName}`);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(400).json({
          error: `Not your turn to speak. Current speaker: ${session.current_speaker}`,
          currentSpeaker: session.current_speaker,
          code: 'NOT_YOUR_TURN'
        });
      }

      console.log('Starting transcription for student:', studentName);

      let transcription;
      try {
        transcription = await transcribeAudio(audioFile.path);
        console.log('Transcription result for', studentName, ':', transcription ? transcription.substring(0, 100) + '...' : 'null');
      } catch (transcriptionError) {
        console.error('Transcription failed for', studentName, ':', transcriptionError);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(500).json({
          error: 'Audio transcription failed',
          details: 'Could not process your audio. Please try speaking more clearly.',
          code: 'TRANSCRIPTION_FAILED'
        });
      }

      if (!transcription || transcription.trim().length < 10) {
        console.error('Transcription too short for', studentName, ':', transcription);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(400).json({
          error: 'Could not transcribe audio',
          details: 'Audio was too short, unclear, or contained no speech. Please try again.',
          code: 'TRANSCRIPTION_TOO_SHORT'
        });
      }

      console.log('Storing transcription for', studentName);

      // Use the corrected database insert for peer debates
      try {
        await pool.query(
          `INSERT INTO audio_transcriptions (peer_session_id, audio_file_path, transcription, debate_type, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [sessionId, audioFile.path, transcription, 'peer']
        );
        console.log('Successfully stored transcription for', studentName);
      } catch (dbError) {
        console.error('Database insert failed for', studentName, ':', dbError);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(500).json({
          error: 'Failed to store transcription',
          code: 'DATABASE_ERROR'
        });
      }

      console.log('Processing peer argument for', studentName);

      try {
        const response = await processPeerArgument({
          sessionId,
          argument: transcription,
          studentName,
          isVoice: true
        });

        console.log('Successfully processed peer argument for', studentName);

        // Clean up audio file after successful processing
        setTimeout(() => {
          if (fs.existsSync(audioFile.path)) {
            fs.unlinkSync(audioFile.path);
            console.log('Cleaned up audio file for', studentName);
          }
        }, 60000);

        res.json({
          transcription,
          ...response,
          audioInfo: {
            size: audioFile.size,
            filename: audioFile.filename
          }
        });

      } catch (processError) {
        console.error('Processing failed for', studentName, ':', processError);
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        return res.status(500).json({
          error: 'Failed to process argument',
          details: processError.message,
          code: 'PROCESSING_FAILED'
        });
      }

    } catch (error) {
      console.error('Unexpected error processing peer voice argument for', req.body?.studentName || 'unknown', ':', error);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        error: 'Failed to process voice argument',
        details: error.message,
        code: 'PROCESSING_FAILED'
      });
    }
  }
);

// Enhanced processPeerArgument function with better error handling
async function processPeerArgument({ sessionId, argument, studentName, isVoice = false }) {
  console.log(`Processing argument for ${studentName} in session ${sessionId}`);

  try {
    const sessionResult = await pool.query(
      `SELECT pds.* FROM peer_debate_sessions pds WHERE pds.id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Peer debate session ${sessionId} not found`);
    }

    const session = sessionResult.rows[0];
    const topic = DEBATE_TOPICS.find(t => t.id === session.topic_id);

    if (session.current_speaker !== studentName) {
      throw new Error(`Not ${studentName}'s turn to speak. Current speaker: ${session.current_speaker}`);
    }

    // Insert message with better error handling
    try {
      await pool.query(
        `INSERT INTO peer_debate_messages (session_id, speaker, content, round_number, is_voice, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [sessionId, studentName, argument, session.current_round, isVoice]
      );
      console.log(`Message stored for ${studentName}`);
    } catch (messageError) {
      console.error(`Failed to store message for ${studentName}:`, messageError);
      throw new Error('Failed to store debate message');
    }

    // Get participants
    const participantsResult = await pool.query(
      `SELECT student_name, position FROM peer_debate_participants 
       WHERE session_id = $1 AND left_at IS NULL`,
      [sessionId]
    );

    const participants = participantsResult.rows;
    const opponent = participants.find(p => p.student_name !== studentName);

    if (!opponent) {
      console.warn(`No opponent found for ${studentName} in session ${sessionId}`);
    }

    // Generate moderator feedback
    let moderatorFeedback;
    try {
      moderatorFeedback = await generateModeratorFeedback(argument, topic, session.current_round, isVoice);
    } catch (moderatorError) {
      console.error('Moderator feedback generation failed:', moderatorError);
      moderatorFeedback = {
        comment: "Continue with your argument.",
        warning: null,
        score: 7,
        issues: []
      };
    }

    // Calculate next speaker and round
    let nextSpeaker = opponent ? opponent.student_name : studentName;
    let currentRound = session.current_round;
    let sessionState = 'active';

    const roundMessages = await pool.query(
      `SELECT COUNT(*) as count FROM peer_debate_messages 
       WHERE session_id = $1 AND round_number = $2`,
      [sessionId, currentRound]
    );

    if (roundMessages.rows[0].count >= 2) {
      if (currentRound >= session.total_rounds) {
        sessionState = 'finished';
        let finalAnalysis;
        try {
          finalAnalysis = await generateFinalAnalysis(sessionId, participants);
        } catch (analysisError) {
          console.error('Final analysis generation failed:', analysisError);
          finalAnalysis = {
            winner: "Both participants",
            winnerReason: "Both showed strong effort",
            participantScores: participants.map(p => ({
              name: p.student_name,
              logicScore: 7,
              evidenceScore: 7,
              clarityScore: 7,
              overallScore: 7
            })),
            keyObservations: ["Good participation from both debaters"],
            improvements: ["Continue practicing debate skills"]
          };
        }

        await pool.query(
          `UPDATE peer_debate_sessions SET state = 'finished', ended_at = NOW() WHERE id = $1`,
          [sessionId]
        );

        broadcastToRoom(sessionId, {
          type: 'debate_ended',
          analysis: finalAnalysis
        });

        return {
          moderatorComment: moderatorFeedback.comment,
          feedback: moderatorFeedback,
          finalAnalysis,
          debateComplete: true
        };

      } else {
        currentRound += 1;
        nextSpeaker = studentName; // Same student starts next round
      }
    }

    // Update session state
    await pool.query(
      `UPDATE peer_debate_sessions 
       SET current_speaker = $1, current_round = $2, state = $3 
       WHERE id = $4`,
      [nextSpeaker, currentRound, sessionState, sessionId]
    );

    console.log(`Updated session ${sessionId}: next speaker = ${nextSpeaker}, round = ${currentRound}`);

    // Broadcast updates
    broadcastToRoom(sessionId, {
      type: 'new_message',
      message: {
        id: Date.now(),
        speaker: studentName,
        content: argument,
        timestamp: new Date(),
        round: session.current_round,
        isVoice
      }
    });

    broadcastToRoom(sessionId, {
      type: 'state_update',
      currentSpeaker: nextSpeaker,
      currentRound: currentRound,
      timeRemaining: session.time_per_turn,
      state: sessionState
    });

    if (moderatorFeedback.comment) {
      broadcastToRoom(sessionId, {
        type: 'new_message',
        message: {
          id: Date.now() + 1,
          speaker: 'moderator',
          content: moderatorFeedback.comment,
          timestamp: new Date(),
          isModerator: true
        }
      });
    }

    return {
      moderatorComment: moderatorFeedback.comment,
      feedback: moderatorFeedback
    };

  } catch (error) {
    console.error(`Error in processPeerArgument for ${studentName}:`, error);
    throw error;
  }
}

app.post('/api/debate/peer/leave', async (req, res) => {
  try {
    const { sessionId, studentName } = req.body;

    await pool.query(
      `UPDATE peer_debate_participants 
       SET left_at = NOW() 
       WHERE session_id = $1 AND student_name = $2`,
      [sessionId, studentName]
    );

    await pool.query(
      `UPDATE peer_debate_sessions 
       SET state = 'finished', ended_at = NOW() 
       WHERE id = $1`,
      [sessionId]
    );

    broadcastToRoom(sessionId, {
      type: 'participant_left',
      participantName: studentName,
      message: `${studentName} left the debate. Session ended.`
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Error leaving peer debate:', error);
    res.status(500).json({ error: 'Failed to leave peer debate' });
  }
});

app.get('/api/dashboard/:studentName', async (req, res) => {
  try {
    const { studentName } = req.params;

    const sessionsResult = await pool.query(
      `SELECT ds.*, COUNT(dm.id) as message_count
       FROM debate_sessions ds
       LEFT JOIN debate_messages dm ON ds.id = dm.session_id AND dm.speaker = 'student'
       WHERE ds.student_name = $1
       GROUP BY ds.id
       ORDER BY ds.created_at DESC`,
      [studentName]
    );

    const analysesResult = await pool.query(
      `SELECT aa.analysis_result, aa.created_at
       FROM argument_analyses aa
       JOIN debate_sessions ds ON aa.session_id = ds.id
       WHERE ds.student_name = $1
       ORDER BY aa.created_at DESC`,
      [studentName]
    );

    const analyses = analysesResult.rows.map(row => {
      try {
        if (typeof row.analysis_result === 'object' && row.analysis_result !== null) {
          return row.analysis_result;
        }
        return JSON.parse(row.analysis_result);
      } catch (error) {
        console.warn('Failed to parse analysis result:', error.message);
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

app.post('/api/debug/voice-test',
  upload.single('audio'),
  handleMulterErrors,
  (req, res) => {
    console.log('=== Voice Upload Test ===');
    console.log('Body:', req.body);
    console.log('File:', req.file);

    if (req.file) {
      setTimeout(() => {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }, 5000);
    }

    res.json({
      success: true,
      body: req.body,
      file: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      } : null
    });
  }
);

app.get('/api/health/audio', async (req, res) => {
  try {
    const uploadDir = 'uploads/audio/';
    const dirExists = fs.existsSync(uploadDir);

    let speechClientStatus = 'unknown';
    try {
      speechClientStatus = speechClient ? 'initialized' : 'not_initialized';
    } catch (error) {
      speechClientStatus = 'error: ' + error.message;
    }

    res.json({
      status: 'healthy',
      uploadDirectory: {
        exists: dirExists,
        path: path.resolve(uploadDir)
      },
      speechClient: speechClientStatus,
      multerConfig: {
        maxFileSize: '25MB',
        allowedTypes: ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg']
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

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

async function handleVoiceAudioStream(data, sessionId, senderWs) {
  try {
    const { speakerName, audioData } = data;

    const sessionResult = await pool.query(
      'SELECT current_speaker FROM peer_debate_sessions WHERE id = $1 AND state = $2',
      [sessionId, 'active']
    );

    if (sessionResult.rows.length === 0) {
      console.log('Invalid session for voice streaming:', sessionId);
      return;
    }

    const session = sessionResult.rows[0];

    if (session.current_speaker !== speakerName) {
      console.log('Unauthorized voice streaming attempt from:', speakerName);
      return;
    }

    // Log voice streaming activity
    await pool.query(
      `INSERT INTO voice_streaming_logs (session_id, speaker_name, chunk_size, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [sessionId, speakerName, audioData.length]
    );

    if (activeConnections.has(sessionId)) {
      const connections = activeConnections.get(sessionId);
      const message = JSON.stringify({
        type: 'voice_audio_stream',
        speakerName,
        audioData,
        timestamp: Date.now()
      });

      connections.forEach(ws => {
        if (ws !== senderWs && ws.isActive && ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }

    console.log(`Streamed voice audio from ${speakerName} to session ${sessionId}`);

  } catch (error) {
    console.error('Error handling voice audio stream:', error);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/');

  console.log('WebSocket connection:', url.pathname);

  if (pathParts[1] === 'waiting') {
    const studentName = pathParts[2];
    const topicId = parseInt(pathParts[3]);

    console.log(`Student ${studentName} connected to waiting room for topic ${topicId}`);

    for (let [key, player] of waitingPlayers.entries()) {
      if (player.studentName === studentName && player.topicId === topicId) {
        player.ws = ws;
        console.log(`Updated WebSocket for waiting player ${studentName}`);
        break;
      }
    }

    ws.on('close', () => {
      console.log(`Student ${studentName} disconnected from waiting room`);
      for (let [key, player] of waitingPlayers.entries()) {
        if (player.studentName === studentName) {
          waitingPlayers.delete(key);
          console.log(`Removed ${studentName} from waiting list due to disconnect`);
          break;
        }
      }
    });
  }

  else if (pathParts[1] === 'debate' && pathParts[2] === 'peer') {
    const sessionId = pathParts[3];

    if (!activeConnections.has(sessionId)) {
      activeConnections.set(sessionId, new Set());
    }

    activeConnections.get(sessionId).add(ws);
    console.log(`Added connection to debate session ${sessionId}`);

    ws.sessionId = sessionId;
    ws.isActive = true;

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.type) {
          case 'voice_audio_stream':
            await handleVoiceAudioStream(data, sessionId, ws);
            break;

          case 'opponent_speaking_start':
            broadcastToRoom(sessionId, {
              type: 'opponent_speaking_start',
              speakerName: data.speakerName
            }, ws);
            break;

          case 'opponent_speaking_end':
            broadcastToRoom(sessionId, {
              type: 'opponent_speaking_end',
              speakerName: data.speakerName
            }, ws);
            break;

          default:
            broadcastToRoom(sessionId, data, ws);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      ws.isActive = false;
      if (activeConnections.has(sessionId)) {
        activeConnections.get(sessionId).delete(ws);
        if (activeConnections.get(sessionId).size === 0) {
          activeConnections.delete(sessionId);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      ws.isActive = false;
    });
  }
});

function broadcastToRoom(sessionId, message, exclude = null) {
  if (activeConnections.has(sessionId)) {
    const connections = activeConnections.get(sessionId);
    const messageStr = JSON.stringify(message);

    connections.forEach(ws => {
      if (ws !== exclude && ws.isActive && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Error broadcasting to WebSocket:', error);
          ws.isActive = false;
          connections.delete(ws);
        }
      }
    });

    connections.forEach(ws => {
      if (!ws.isActive || ws.readyState !== WebSocket.OPEN) {
        connections.delete(ws);
      }
    });

    if (connections.size === 0) {
      activeConnections.delete(sessionId);
    }
  }
}

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
      timeout: 30000
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

async function transcribeAudio(audioFilePath) {
  console.log('Transcribing audio file:', audioFilePath);

  try {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    const stats = fs.statSync(audioFilePath);
    console.log('Audio file size:', stats.size, 'bytes');

    if (stats.size === 0) {
      throw new Error('Audio file is empty');
    }

    const file = fs.readFileSync(audioFilePath);
    const audioBytes = file.toString('base64');

    const audio = {
      content: audioBytes,
    };

    const config = {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      enableAutomaticPunctuation: true,
      model: 'latest_long',
    };

    const request = {
      audio: audio,
      config: config,
    };

    console.log('Sending request to Google Speech-to-Text...');
    const [response] = await speechClient.recognize(request);

    if (!response.results || response.results.length === 0) {
      console.log('No speech detected in audio');
      return null;
    }

    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join(' ')
      .trim();

    console.log('Transcription successful, length:', transcription.length);
    return transcription;

  } catch (error) {
    console.error('Google STT error:', {
      message: error.message,
      code: error.code,
      details: error.details
    });

    return null;
  }
}

async function generateModeratorFeedback(argument, topic, round, isVoice = false) {
  try {
    const voiceContext = isVoice ? "\n\nNote: This was a voice argument. Consider speech patterns and delivery." : "";

    const systemPrompt = `You are an AI debate moderator. Analyze the argument for:
1. Logical fallacies
2. Quality of evidence
3. Relevance to topic
4. Respectful tone
5. Speech clarity and delivery (if voice)

Provide brief, constructive feedback. If there are issues, give warnings.${voiceContext}`;

    const userPrompt = `Round ${round} ${isVoice ? 'voice ' : ''}argument about "${topic.title}":
"${argument}"

Provide moderation feedback in JSON format:
{
  "comment": "Brief feedback comment",
  "warning": "Warning if needed or null",
  "score": 1-10,
  "issues": ["list of issues if any"],
  "voiceQuality": ${isVoice ? '"assessment of speech clarity"' : 'null'}
}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const response = await callAIMLAPI(messages, 300, 0.3);
    return safeJSONParse(response, {
      comment: "Continue with your argument.",
      warning: null,
      score: 7,
      issues: [],
      voiceQuality: isVoice ? "Clear speech" : null
    });

  } catch (error) {
    console.error('Error generating moderator feedback:', error);
    return {
      comment: "Continue with your argument.",
      warning: null,
      score: 7,
      issues: [],
      voiceQuality: isVoice ? "Clear speech" : null
    };
  }
}

async function generateFinalAnalysis(sessionId, participants) {
  try {
    const messagesResult = await pool.query(
      `SELECT speaker, content, round_number, is_voice FROM peer_debate_messages 
       WHERE session_id = $1 AND speaker != 'moderator' 
       ORDER BY created_at ASC`,
      [sessionId]
    );

    const messages = messagesResult.rows;
    const conversationText = messages.map(m =>
      `Round ${m.round_number} - ${m.speaker}${m.is_voice ? ' (voice)' : ''}: ${m.content}`
    ).join('\n\n');

    const voiceCount = messages.filter(m => m.is_voice).length;
    const hasVoice = voiceCount > 0;

    const systemPrompt = `You are an expert debate judge. Analyze this peer debate and provide comprehensive feedback.

${hasVoice ? 'This debate included voice arguments. Consider both content and delivery quality.' : ''}

Evaluate each participant on:
1. Logic and reasoning (1-10)
2. Evidence quality (1-10) 
3. Clarity and communication (1-10)
4. Overall performance (1-10)
${hasVoice ? '5. Voice delivery and engagement (1-10)' : ''}

Determine the winner and provide detailed analysis.`;

    const userPrompt = `Participants: ${participants.map(p => `${p.student_name} (${p.position})`).join(', ')}
${hasVoice ? `\nVoice arguments: ${voiceCount} out of ${messages.length} total arguments` : ''}

Debate transcript:
${conversationText}

Provide analysis in JSON format:
{
  "winner": "participant name",
  "winnerReason": "brief explanation",
  "participantScores": [
    {
      "name": "student name",
      "logicScore": 8,
      "evidenceScore": 7,
      "clarityScore": 9,
      "overallScore": 8${hasVoice ? ',\n      "voiceScore": 8' : ''}
    }
  ],
  "keyObservations": ["observation1", "observation2"],
  "improvements": ["improvement1", "improvement2"],
  "voiceAnalysis": ${hasVoice ? '"analysis of voice performance"' : 'null'}
}`;

    const messages_ai = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const response = await callAIMLAPI(messages_ai, 800, 0.3);
    return safeJSONParse(response, {
      winner: participants[0].student_name,
      winnerReason: "Both participants showed strong reasoning",
      participantScores: participants.map(p => ({
        name: p.student_name,
        logicScore: 7,
        evidenceScore: 7,
        clarityScore: 7,
        overallScore: 7,
        ...(hasVoice && { voiceScore: 7 })
      })),
      keyObservations: ["Both participants engaged thoughtfully"],
      improvements: ["Continue practicing evidence-based arguments"],
      voiceAnalysis: hasVoice ? "Good use of voice communication" : null
    });

  } catch (error) {
    console.error('Error generating final analysis:', error);
    return {
      winner: "Both participants",
      winnerReason: "Both showed strong effort",
      participantScores: participants.map(p => ({
        name: p.student_name,
        logicScore: 7,
        evidenceScore: 7,
        clarityScore: 7,
        overallScore: 7,
        ...(participants.some(p => p.hasVoice) && { voiceScore: 7 })
      })),
      keyObservations: ["Engaged debate with good participation"],
      improvements: ["Keep practicing critical thinking skills"],
      voiceAnalysis: "Good communication overall"
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

  const recentScores = scores.slice(0, Math.ceil(scores.length / 2));
  const olderScores = scores.slice(Math.ceil(scores.length / 2));
  const recentAvg = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
  const olderAvg = olderScores.length > 0 ? olderScores.reduce((sum, score) => sum + score, 0) / olderScores.length : recentAvg;
  const improvementTrend = recentAvg - olderAvg;

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

// Enhanced database schema for voice streaming
async function updateDatabaseForVoiceStreaming() {
  try {
    await pool.query(`
      ALTER TABLE peer_debate_messages 
      ADD COLUMN IF NOT EXISTS is_voice BOOLEAN DEFAULT FALSE;
      
      CREATE TABLE IF NOT EXISTS voice_streaming_logs (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES peer_debate_sessions(id),
        speaker_name VARCHAR(100) NOT NULL,
        chunk_size INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS voice_quality_metrics (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES peer_debate_sessions(id),
        speaker_name VARCHAR(100) NOT NULL,
        clarity_score DECIMAL(3,2),
        volume_level INTEGER,
        speech_rate DECIMAL(5,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database updated for voice streaming support');
  } catch (error) {
    console.error('Failed to update database for voice streaming:', error);
  }
}

async function initializeDatabase() {
  try {
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

      CREATE TABLE IF NOT EXISTS voice_debate_sessions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES debate_sessions(id),
        audio_count INTEGER DEFAULT 0,
        total_speech_time INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS peer_debate_sessions (
        id SERIAL PRIMARY KEY,
        topic_id INTEGER NOT NULL,
        topic_title VARCHAR(255) NOT NULL,
        time_per_turn INTEGER DEFAULT 120,
        total_rounds INTEGER DEFAULT 3,
        current_round INTEGER DEFAULT 1,
        current_speaker VARCHAR(100),
        state VARCHAR(20) DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS peer_debate_participants (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES peer_debate_sessions(id),
        student_name VARCHAR(100) NOT NULL,
        position VARCHAR(10) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS peer_debate_messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES peer_debate_sessions(id),
        speaker VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'argument',
        round_number INTEGER,
        is_voice BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Updated audio_transcriptions table
      CREATE TABLE IF NOT EXISTS audio_transcriptions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES debate_sessions(id) ON DELETE CASCADE,
        peer_session_id INTEGER REFERENCES peer_debate_sessions(id) ON DELETE CASCADE,
        audio_file_path VARCHAR(500),
        transcription TEXT,
        confidence_score DECIMAL(3,2),
        processing_time INTEGER,
        debate_type VARCHAR(20) DEFAULT 'ai',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT audio_transcriptions_session_check 
        CHECK (
          (debate_type = 'ai' AND session_id IS NOT NULL AND peer_session_id IS NULL) OR
          (debate_type = 'peer' AND peer_session_id IS NOT NULL AND session_id IS NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS voice_streaming_logs (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES peer_debate_sessions(id),
        speaker_name VARCHAR(100) NOT NULL,
        chunk_size INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS voice_quality_metrics (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES peer_debate_sessions(id),
        speaker_name VARCHAR(100) NOT NULL,
        clarity_score DECIMAL(3,2),
        volume_level INTEGER,
        speech_rate DECIMAL(5,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}

app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'File too large',
      details: 'The uploaded file exceeds the maximum size limit',
      code: 'ENTITY_TOO_LARGE'
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

initializeDatabase().then(() => {
  updateDatabaseForVoiceStreaming().then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`WebSocket server ready`);
      console.log(`AI/ML API URL: ${AI_ML_API_CONFIG.baseURL}`);
      console.log(`AI/ML Model: ${AI_ML_API_CONFIG.model}`);
      console.log(`Upload directory: ${path.resolve('uploads/audio/')}`);

      const uploadDir = 'uploads/audio/';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Created upload directory');
      }
    });
  }).catch(error => {
    console.error('Failed to update database for voice streaming:', error);
    process.exit(1);
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});