# LLM Web Chat

A modern chat application with AWS Bedrock integration, Speech-to-Text, and Text-to-Speech capabilities.

## Prerequisites

- [Bun](https://bun.sh) (latest version)
- AWS credentials configured with access to:
  - Amazon Bedrock (with Claude models enabled)
  - Amazon Transcribe Streaming
  - Amazon Polly

## Setup Instructions

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd llm-web-chat
```

### 2. Install dependencies
```bash
bun install
```

### 3. Create environment file
Create `apps/server/.env` with:
```env
# Server configuration
PORT=3001

# AWS configuration
AWS_REGION=us-east-1

# Bedrock configuration
DEFAULT_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
SUMMARIZER_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0

# Optional: If using provisioned throughput
BEDROCK_INFERENCE_PROFILE_ARN=arn:aws:bedrock:us-east-1:123456789012:inference-profile/your-profile-id
```

### 4. Initialize the database
```bash
cd apps/server
bun run db:push    # Create tables from schema
bun run db:migrate # Apply any additional migrations
```

### 5. Verify AWS permissions
Ensure your AWS credentials have the following permissions:
- `bedrock:InvokeModel` (or `bedrock:InvokeModelWithResponseStream` for streaming)
- `transcribe:StartStreamTranscription`
- `polly:SynthesizeSpeech`

### 6. Start the application
From the root directory:
```bash
bun run dev
```

This starts both:
- Server: http://localhost:3001
- Web UI: http://localhost:5173

## Configuration

### Available Models
Edit `apps/server/src/config/models.ts` to add/remove Bedrock models.

### Theme Customization
- Light/dark mode: Automatic based on system preference
- Color schemes: Default, Sky, Emerald, Rose
- Custom schemes: Edit `apps/web/src/index.css`

## Features

- **Multi-chat management**: Create, delete, and switch between conversations
- **Voice input**: Click the microphone button to dictate messages
- **Smart summaries**: Automatic summary generation with TTS playback
- **Responsive design**: Works on desktop and mobile devices
- **Real-time transcription**: See your speech converted to text as you speak

## Troubleshooting

### Database Issues
If you get "table not found" errors:
```bash
cd apps/server
rm llm-web-chat.sqlite
bun run db:push
bun run db:migrate
```

### AWS Permission Errors
- Check IAM role has required permissions
- Verify AWS_REGION matches your Bedrock endpoint
- Ensure models are enabled in your AWS account

### WebSocket Connection Failed
- Check server is running on correct port
- Verify no firewall blocking WebSocket connections
- Try using 127.0.0.1 instead of localhost

## Development

### Project Structure
```
llm-web-chat/
├── apps/
│   ├── server/         # Bun/Hono API server
│   │   ├── src/
│   │   ├── drizzle/    # Database migrations
│   │   └── .env        # Server environment
│   └── web/            # React frontend
│       └── src/
├── package.json        # Workspace configuration
└── bun.lockb          # Dependency lock file
```

### Key Commands
- `bun run dev` - Start development servers
- `bun run db:push` - Push schema to database
- `bun run db:migrate` - Run migrations
- `bun run db:studio` - Open Drizzle Studio (database UI)