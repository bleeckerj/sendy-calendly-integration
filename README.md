# Calendly-Sendy Integration

A Node.js service that automatically adds Calendly appointment bookers to your Sendy email lists. When someone books an appointment through Calendly, their email is automatically added to your specified Sendy list.

## Features

- 🚀 **Real-time Integration**: Instant subscriber addition via Calendly webhooks
- 🔒 **Secure**: Webhook signature verification for security
- 💾 **Smart Caching**: Prevents duplicate subscriptions
- 📊 **Logging**: Comprehensive logging for monitoring
- ⚡ **Lightweight**: Minimal dependencies, fast performance
- 🛠 **Self-hosted**: Own your integration, no third-party services

## Prerequisites

- Node.js 16+ installed
- A [Calendly](https://calendly.com) account with webhook access
- A [Sendy](https://sendy.co) installation with API access
- A server or hosting platform to run the service

## Quick Start

1. **Clone and Install**
   ```bash
   git clone <your-repo>
   cd calendly-sendy-integration
   npm install
   ```

2. **Configure Environment**
   ```bash
   npm run setup
   # Follow the interactive setup to configure your API keys
   ```

3. **Start the Server**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```

4. **Configure Calendly Webhook**
   - Go to your Calendly account settings
   - Add webhook URL: `https://your-domain.com/webhook/calendly`
   - Select "Invitee Created" event
   - Add your webhook secret for security

## Configuration

### Environment Variables

Create a `.env` file (or use `npm run setup`):

```env
# Sendy Configuration
SENDY_API_KEY=your_sendy_api_key_here
SENDY_INSTALLATION_URL=https://your-sendy-installation.com
SENDY_LIST_ID=your_calendly_list_id_here

# Calendly Configuration
CALENDLY_WEBHOOK_SECRET=your_webhook_verification_secret_here
CALENDLY_PERSONAL_ACCESS_TOKEN=your_calendly_personal_access_token_here

# Server Configuration
PORT=3000
NODE_ENV=production

# Cache Configuration
CACHE_TTL=3600
```

### Required Sendy Information

1. **API Key**: Found in Sendy Settings → API
2. **Installation URL**: Your Sendy installation domain (e.g., `https://newsletters.yoursite.com`)
3. **List ID**: Create a list called "Calendly" and get its ID from the list settings

### Calendly Information

1. **Webhook Secret**: Set in Calendly webhook configuration for security (verifies incoming webhooks)
2. **Personal Access Token (PAT)**: Create in Calendly under Integrations/Developer settings → Personal Access Tokens. Use this value in `CALENDLY_PERSONAL_ACCESS_TOKEN` to enable the CLI scripts (listing, analytics, sync). 

## Deployment Options

### Option 1: Railway (Recommended - Easiest)

1. **Fork this repository**
2. **Connect to Railway**:
   - Go to [Railway](https://railway.app)
   - Create new project from GitHub
   - Select your forked repository
3. **Set Environment Variables**:
   - Add all variables from your `.env` file
4. **Deploy**: Railway automatically builds and deploys

### Option 2: Heroku

1. **Prepare for Heroku**:
   ```bash
   # Install Heroku CLI, then:
   heroku create your-calendly-sendy-app
   ```

2. **Set Environment Variables**:
   ```bash
   heroku config:set SENDY_API_KEY=your_key
   heroku config:set SENDY_INSTALLATION_URL=https://your-sendy.com
   heroku config:set SENDY_LIST_ID=your_list_id
   # ... add all other variables
   ```

3. **Deploy**:
   ```bash
   git push heroku main
   ```

### Option 3: DigitalOcean App Platform

1. **Create App**: Go to DigitalOcean → Apps → Create App
2. **Connect Repository**: Link your GitHub repository
3. **Configure Environment**: Add environment variables in app settings
4. **Deploy**: DigitalOcean handles the rest

### Option 4: Self-hosted with PM2

1. **Install PM2**:
   ```bash
   npm install -g pm2
   ```

2. **Create PM2 Config** (`ecosystem.config.js`):
   ```javascript
   module.exports = {
     apps: [{
       name: 'calendly-sendy-integration',
       script: './src/server.js',
       instances: 1,
       autorestart: true,
       watch: false,
       env: {
         NODE_ENV: 'production',
         PORT: 3000
       }
     }]
   };
   ```

3. **Start with PM2**:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

### Option 5: Docker

1. **Create Dockerfile**:
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY src ./src
   EXPOSE 3000
   CMD ["npm", "start"]
   ```

2. **Build and Run**:
   ```bash
   docker build -t calendly-sendy-integration .
   docker run -p 3000:3000 --env-file .env calendly-sendy-integration
   ```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and health information.

### Webhook Endpoint
```
POST /webhook/calendly
```
Receives Calendly webhook events. Configure this URL in your Calendly webhook settings.

## Monitoring and Logs

### Local Development
```bash
npm run dev
# Logs appear in console with timestamps
```

### Production Monitoring

**Check Health**:
```bash
curl https://your-domain.com/health
```

**View Logs** (varies by platform):
- **Railway**: View in dashboard logs tab
- **Heroku**: `heroku logs --tail`
- **PM2**: `pm2 logs`

### Log Levels
- `INFO`: Normal operations, successful subscriptions
- `WARN`: Non-critical issues, already subscribed users
- `ERROR`: Failed API calls, configuration issues

## Troubleshooting

### Common Issues

**1. "Invalid signature" errors**
- Ensure `CALENDLY_WEBHOOK_SECRET` matches Calendly webhook settings
- Check webhook URL is correct

**2. "Sendy API error" messages**
- Verify `SENDY_API_KEY` and `SENDY_INSTALLATION_URL`
- Check Sendy list ID exists and is correct
- Ensure Sendy installation is accessible

**3. Server won't start**
- Run `npm run setup` to reconfigure
- Check all required environment variables are set
- Verify Node.js version (16+ required)

**4. Webhooks not received**
- Check server is publicly accessible
- Verify webhook URL in Calendly settings
- Test with `curl -X POST https://your-domain.com/health`

### Testing

**Test Webhook Endpoint**:
```bash
curl -X POST https://your-domain.com/webhook/calendly \
  -H "Content-Type: application/json" \
  -d '{"event":"invitee.created","payload":{"email":"test@example.com","name":"Test User","created_at":"2023-01-01T12:00:00Z"}}'
```

**Manual Subscriber Test**:
```javascript
// Test Sendy API directly
const sendyService = require('./src/services/sendyService');
sendyService.addSubscriber({
  email: 'test@example.com',
  name: 'Test User',
  listId: 'your_list_id'
}).then(console.log);
```

## Security Notes

- Always use HTTPS in production
- Set strong webhook secrets
- Regularly rotate API keys
- Monitor logs for suspicious activity
- Keep dependencies updated

## Development

### Project Structure
```
src/
├── server.js              # Main server file
├── setup.js               # Interactive setup script
├── handlers/
│   └── webhookHandler.js  # Calendly webhook processing
├── services/
│   └── sendyService.js    # Sendy API integration
└── utils/
    ├── cache.js           # Caching utilities
    ├── config.js          # Configuration validation
    └── logger.js          # Logging utilities
```

### Scripts
- `npm start`: Start production server
- `npm run dev`: Start development server with auto-reload
- `npm run setup`: Interactive configuration setup
- `npm test`: Run tests (if added)
- `npm run lint`: Check code style

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review server logs for error details
3. Test individual components (Sendy API, webhook endpoint)
4. Create an issue with detailed logs and configuration (remove sensitive data)

---

**Need help?** The integration includes comprehensive logging to help diagnose issues. Check your server logs and the troubleshooting section above.