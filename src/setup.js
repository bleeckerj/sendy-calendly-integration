const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function setup() {
  console.log('🚀 Calendly-Sendy Integration Setup\n');
  
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', '.env.example');
  
  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    const overwrite = await ask('.env file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('Please provide the following information:\n');

  // Sendy Configuration
  console.log('📧 Sendy Configuration:');
  const sendyUrl = await ask('Sendy installation URL (e.g., https://your-sendy.com): ');
  const sendyApiKey = await ask('Sendy API key: ');
  const sendyListId = await ask('Sendy list ID for Calendly subscribers: ');

  // Calendly Configuration
  console.log('\n📅 Calendly Configuration:');
  const calendlyToken = await ask('Calendly Personal Access Token (PAT) (optional): ');
  const webhookSecret = await ask('Calendly webhook secret (optional but recommended): ');

  // Server Configuration
  console.log('\n⚙️  Server Configuration:');
  const port = await ask('Server port (default: 3000): ') || '3000';

  // Generate .env file
  const envContent = `# Calendly-Sendy Integration Configuration
# Generated on ${new Date().toISOString()}

# Calendly Configuration
CALENDLY_WEBHOOK_SECRET=${webhookSecret}
CALENDLY_PERSONAL_ACCESS_TOKEN=${calendlyToken}

# Sendy Configuration
SENDY_API_KEY=${sendyApiKey}
SENDY_INSTALLATION_URL=${sendyUrl}
SENDY_LIST_ID=${sendyListId}

# Server Configuration
PORT=${port}
NODE_ENV=development

# Cache Configuration (in seconds)
CACHE_TTL=3600
`;

  fs.writeFileSync(envPath, envContent);
  
  console.log('\n✅ Configuration saved to .env file');
  console.log('\n📋 Next steps:');
  console.log('1. Install dependencies: npm install');
  console.log('2. Start the server: npm run dev');
  console.log('3. Configure Calendly webhook to point to: http://your-domain:' + port + '/webhook/calendly');
  console.log('4. Test the integration by booking a test appointment');
  
  rl.close();
}

setup().catch(console.error);