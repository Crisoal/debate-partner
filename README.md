# Socratic AI Debate Partner

An intelligent debate platform that transforms traditional argumentation education through real-time AI analysis, voice integration, and peer-to-peer competition with AI moderation.

## Table of Contents
- [Features](#features)
- [System Architecture](#system-architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [WebSocket Events](#websocket-events)
- [Voice Processing](#voice-processing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)


## Features

### Core Debate Modes
- **AI Opponent Debates**: Engage with intelligent AI that adapts arguments based on conversation history
- **Voice Debates**: Natural speech-to-text integration with AI responses converted to speech
- **Peer-to-Peer Debates**: Real-time student vs student debates with AI moderation

### Real-time Analysis
- Logical fallacy detection and identification
- Evidence quality assessment
- Argument strength evaluation
- Live moderator feedback during debates

### Educational Dashboard
- Performance tracking across multiple debates
- Improvement trend analysis
- Common weakness identification
- Detailed argument history with analytics

### Advanced Features
- Real-time WebSocket communication for peer debates
- Turn-based time management with automatic switching
- Multi-round debate structure with scoring
- Audio transcription with Google Cloud Speech-to-Text
- Comprehensive error handling and user feedback

## System Architecture

```
Frontend (React)
├── Components/
│   ├── TopicSelector
│   ├── DebateArena (AI debates)
│   ├── VoiceDebateArena (Voice-enabled)
│   ├── PeerDebateArena (P2P with voice)
│   ├── ArgumentAnalyzer
│   └── Dashboard
├── Utils/
│   └── API (Axios-based service layer)
└── State Management (React Hooks)

Backend (Node.js/Express)
├── REST API Endpoints
├── WebSocket Server (Real-time communication)
├── File Upload Handling (Multer)
├── AI Integration (AI/ML API)
├── Voice Processing (Google Speech-to-Text)
└── Database Layer (PostgreSQL)

External Services
├── AI/ML API (Argument generation & analysis)
├── Google Cloud Speech-to-Text
└── PostgreSQL Database
```

## Prerequisites

### Software Requirements
- Node.js (v16.0.0 or higher)
- npm (v8.0.0 or higher)
- PostgreSQL (v12.0 or higher)
- Git

### API Keys Required
- AI/ML API key for argument generation
- Google Cloud Platform credentials for Speech-to-Text
- (Optional) Custom domain for WebSocket connections

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/Crisoal/debate-partner.git
cd socratic-ai-debate
```

### 2. Install Backend Dependencies
```bash
# Install server dependencies
npm install

# Required packages will include:
# express, cors, helmet, pg, multer, ws, axios
# @google-cloud/speech, express-rate-limit, dotenv
```

### 3. Install Frontend Dependencies
```bash
cd client
npm install

# Required packages will include:
# react, react-dom, axios, tailwindcss
```

## Environment Configuration

### Backend Environment Variables (.env)
```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/socratic_debate

# AI/ML API Configuration
AIML_API_URL=https://api.aimlapi.com/v1/chat/completions
AIML_API_KEY=your_aiml_api_key_here
AIML_MODEL=gpt-4o-mini

# Google Cloud Speech-to-Text
# Set up Google Cloud credentials file and reference it:
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/credentials.json

# CORS and Security
CORS_ORIGIN=http://localhost:3000
```

### Frontend Environment Variables (.env.local)
```bash
# API Configuration
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_WS_URL=ws://localhost:5000

# Optional: Production URLs
REACT_APP_PROD_API_URL=https://your-domain.com/api
REACT_APP_PROD_WS_URL=wss://your-domain.com
```

## Database Setup

### 1. Create Database
```sql
CREATE DATABASE socratic_debate;
CREATE USER socratic_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE socratic_debate TO socratic_user;
```

### 2. Database Schema
The application will automatically create the required tables on first run:

```sql
-- Main debate sessions
debate_sessions (id, topic_id, topic_title, student_position, student_name, created_at)

-- Standard debate messages
debate_messages (id, session_id, speaker, content, message_type, created_at)

-- Argument analysis results
argument_analyses (id, session_id, argument_text, analysis_result, created_at)

-- Voice debate specific
voice_debate_sessions (id, session_id, audio_count, total_speech_time, created_at)
audio_transcriptions (id, session_id, audio_file_path, transcription, created_at)

-- Peer debate sessions
peer_debate_sessions (id, topic_id, topic_title, time_per_turn, total_rounds, 
                     current_round, current_speaker, state, created_at, ended_at)

-- Peer debate participants
peer_debate_participants (id, session_id, student_name, position, joined_at, left_at)

-- Peer debate messages
peer_debate_messages (id, session_id, speaker, content, message_type, 
                     round_number, is_voice, created_at)
```

## Running the Application

### Development Mode

#### 1. Start the Backend Server
```bash
# From project root
npm run dev

# Or manually:
node server.js
```

#### 2. Start the Frontend Development Server
```bash
# From client directory
cd client
npm start
```

#### 3. Access the Application
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000/api`
- Health Check: `http://localhost:5000/api/health/ai`

### Production Mode

#### Backend
```bash
npm run build
npm start
```

#### Frontend
```bash
cd client
npm run build
# Serve build folder with your preferred web server
```

## API Documentation

### Authentication
Currently uses student names for identification. Future versions will implement proper authentication.

### Core Endpoints

#### Topics
```http
GET /api/topics
# Returns available debate topics
```

#### Standard AI Debates
```http
POST /api/debate/start
Content-Type: application/json
{
  "topicId": 1,
  "studentPosition": "for|against",
  "studentName": "string",
  "debateMode": "ai"
}

POST /api/debate/argument
Content-Type: application/json
{
  "sessionId": "number",
  "argument": "string"
}
```

#### Voice Debates
```http
POST /api/debate/voice/start
Content-Type: application/json
{
  "topicId": 1,
  "studentPosition": "for|against",
  "studentName": "string"
}

POST /api/debate/voice-argument
Content-Type: multipart/form-data
sessionId: number
audio: file (WebM/Opus preferred)
```

#### Peer Debates
```http
POST /api/debate/peer/start
Content-Type: application/json
{
  "topicId": 1,
  "studentName": "string",
  "studentPosition": "for|against",
  "timePerTurn": 120,
  "totalRounds": 3
}

POST /api/debate/peer/voice-argument
Content-Type: multipart/form-data
sessionId: number
studentName: string
audio: file
```

#### Dashboard
```http
GET /api/dashboard/:studentName
# Returns performance metrics and debate history
```

### Debug Endpoints
```http
GET /api/health/ai        # Check AI API connection
GET /api/health/audio     # Check audio processing setup
GET /api/debug/peer-session/:sessionId  # Debug peer session state
```

## WebSocket Events

### Peer Debate Events

#### Client → Server
```javascript
// Join waiting room
ws.connect('/waiting/:studentName/:topicId')

// Join active debate
ws.connect('/debate/peer/:sessionId')
```

#### Server → Client
```javascript
// Match found in waiting room
{
  type: 'match_found',
  sessionId: number,
  topic: object,
  participants: array,
  currentSpeaker: string
}

// New message in debate
{
  type: 'new_message',
  message: {
    id: number,
    speaker: string,
    content: string,
    timestamp: date,
    round: number,
    isVoice: boolean
  }
}

// State updates
{
  type: 'state_update',
  currentSpeaker: string,
  currentRound: number,
  timeRemaining: number,
  state: string
}

// Debate completion
{
  type: 'debate_ended',
  analysis: {
    winner: string,
    participantScores: array,
    keyObservations: array
  }
}
```

## Voice Processing

### Supported Formats
- Primary: WebM with Opus codec
- Fallback: WAV, MP3, MP4 audio

### Browser Compatibility
- Chrome/Edge: Full WebM/Opus support
- Firefox: WebM/Opus support
- Safari: Limited support, uses fallback formats

### Audio Requirements
- Minimum file size: 1KB
- Maximum file size: 25MB
- Recommended recording length: 3-30 seconds
- Sample rate: 48kHz (WebM) or 44.1kHz (WAV)

### Transcription Process
1. Client records audio using MediaRecorder API
2. Audio blob sent to server via FormData
3. Server validates file and extracts audio
4. Google Cloud Speech-to-Text processes audio
5. Transcription returned to client with AI response

## Deployment

### Environment Preparation
1. Set up PostgreSQL database
2. Configure Google Cloud Speech-to-Text credentials
3. Obtain AI/ML API access
4. Set production environment variables

### Backend Deployment
```bash
# Build and deploy to your preferred platform
# Ensure environment variables are set
# Configure file upload directory permissions
# Set up process management (PM2, systemd, etc.)
```

### Frontend Deployment
```bash
cd client
npm run build
# Deploy build folder to CDN/static hosting
# Update API URLs for production
```

### Recommended Platforms
- **Backend**: Railway, Heroku, DigitalOcean App Platform
- **Database**: Heroku Postgres, DigitalOcean Managed Databases
- **Frontend**: Vercel, Netlify, CloudFlare Pages
- **File Storage**: AWS S3, DigitalOcean Spaces (for production audio files)

## Troubleshooting

### Common Issues

#### Voice Recording Not Working
```bash
# Check browser permissions
navigator.permissions.query({name: 'microphone'})

# Verify MediaRecorder support
MediaRecorder.isTypeSupported('audio/webm;codecs=opus')

# Test microphone access
navigator.mediaDevices.getUserMedia({audio: true})
```

#### Peer Matching Issues
```bash
# Check WebSocket connections
# Verify waiting list state on server
# Confirm session creation in database
# Review server logs for matching logic errors
```

#### Database Connection Problems
```bash
# Verify PostgreSQL is running
sudo service postgresql status

# Check connection string
psql "postgresql://username:password@localhost:5432/socratic_debate"

# Review database logs
tail -f /var/log/postgresql/postgresql-*.log
```

#### AI API Issues
```bash
# Test API connectivity
curl -X GET http://localhost:5000/api/health/ai

# Verify API key and model configuration
# Check rate limits and usage quotas
# Review AI service status page
```

### Performance Optimization
- Enable gzip compression for API responses
- Implement Redis for session management in production
- Use CDN for static assets
- Configure database connection pooling
- Implement audio file cleanup scheduling

### Security Considerations
- Input sanitization for all user content
- Rate limiting on API endpoints
- File upload validation and scanning
- HTTPS enforcement in production
- CORS configuration for trusted origins

## Contributing

### Development Setup
1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Submit pull request with detailed description

### Code Standards
- Use ESLint configuration provided
- Follow React functional component patterns
- Implement proper error handling
- Add comprehensive logging
- Write unit tests for new features

### Testing
```bash
# Backend tests
npm test

# Frontend tests
cd client
npm test

# Integration tests
npm run test:integration
```

## License

MIT License - See LICENSE file for details.

## Support

For issues and questions:
- Create GitHub issue with detailed reproduction steps
- Include relevant log outputs and environment information
- Provide browser/Node.js version details

## Acknowledgments

- Google Cloud Speech-to-Text for voice processing
- AI/ML API for intelligent argument generation
- React and Node.js communities for framework support