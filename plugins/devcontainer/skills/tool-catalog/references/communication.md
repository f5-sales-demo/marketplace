# Communication Tools

Tools for messaging platforms, communication integrations, and email.

## Email

## msmtp

- **Package**: `msmtp` (apt)
- **Purpose**: Lightweight SMTP client that forwards mail to an SMTP relay — works as a sendmail replacement
- **Use when**: Sending email from the command line or scripts via an external SMTP server (Gmail, SendGrid, etc.)
- **Quick start**:
  - `echo "Subject: Test\n\nHello" | msmtp recipient@example.com`
  - `msmtp --host=smtp.gmail.com --port=587 --tls --auth --user=you@gmail.com recipient@example.com < mail.txt`
  - Config via `~/.msmtprc` — set `account default`, `host`, `port`, `tls on`, `auth on`, `user`, `password`
- **Auth**: SMTP credentials in `~/.msmtprc` or via `--user`/`--passwordeval`. For Gmail use an App Password.
- **Docs**: `man msmtp` or <https://marlam.de/msmtp/>

## swaks

- **Package**: `swaks` (apt) — Swiss Army Knife for SMTP
- **Purpose**: Feature-rich SMTP testing and transaction tool supporting AUTH, TLS, MIME, DKIM, and multiple protocols
- **Use when**: Testing SMTP servers, diagnosing mail delivery issues, sending test emails with full control over headers
- **Quick start**:
  - `swaks --to recipient@example.com --server smtp.gmail.com:587 --auth --tls --auth-user you@gmail.com`
  - `swaks --to test@example.com --from me@example.com --body "Hello" --header "Subject: Test"`
  - `swaks --to test@example.com --server localhost:25` (test local MTA)
- **Auth**: `--auth-user` + `--auth-password` or `--auth-password-eval`; supports LOGIN, PLAIN, CRAM-MD5, DIGEST-MD5
- **Docs**: `man swaks` or <https://www.jetmore.org/john/code/swaks/>

## mail (mailutils)

- **Package**: `mailutils` (apt) — provides the `mail` / `mailx` command
- **Purpose**: Classic Unix mail command for sending and reading email from the terminal
- **Use when**: Quick one-liner email sends from shell scripts; reading local system mail
- **Quick start**:
  - `echo "Body text" | mail -s "Subject" recipient@example.com`
  - `mail -s "Backup done" ops@example.com < /var/log/backup.log`
  - `mail` (interactive mail reader for local inbox)
- **Auth**: Relies on a configured local MTA (postfix/msmtp as sendmail). Set up msmtp as sendmail replacement for external SMTP.
- **Docs**: `man mail`

## nodemailer

- **Package**: `nodemailer` (npm, installed globally)
- **Purpose**: Full-featured Node.js email library supporting SMTP, OAuth2, attachments, HTML, and all major providers
- **Use when**: Sending email from Node.js scripts with attachments, HTML bodies, or OAuth2 authentication
- **Quick start**:

  ```javascript
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: '"Sender" <you@gmail.com>',
    to: "recipient@example.com",
    subject: "Hello",
    text: "Hello from the devcontainer",
  });
  ```

- **Auth**: SMTP credentials via env vars (`SMTP_USER`, `SMTP_PASS`) or OAuth2 token. For Gmail use App Password or OAuth2.
- **Docs**: <https://nodemailer.com/>

## cURL (SMTP)

- **Package**: `curl` (apt) — built-in, no install needed
- **Purpose**: Send email directly via SMTP using curl's built-in SMTP support — no extra tools needed
- **Use when**: Quick scripted email sends without installing dedicated mail tools; already have cURL in your pipeline
- **Quick start**:
  - `curl --url "smtps://smtp.gmail.com:465" --ssl-reqd --mail-from "you@gmail.com" --mail-rcpt "to@example.com" --upload-file mail.txt --user "you@gmail.com:app-password"`
  - `curl --url "smtp://smtp.gmail.com:587" --starttls-smtp --mail-from "you@gmail.com" --mail-rcpt "to@example.com" -T mail.txt --user "you@gmail.com:app-password"`
- **Auth**: `--user "username:password"` — for Gmail use an App Password (not your account password)
- **Docs**: `man curl` — search for `--mail-from`

## Signal

## signal-cli

- **Package**: Manual Java application installed at `/opt/signal-cli/` — download from <https://github.com/AsamK/signal-cli/releases>
- **Purpose**: Command-line interface for the Signal messenger, supporting send/receive messages, groups, and attachments
- **Use when**: You need to send or receive Signal messages programmatically, automate notifications, or build Signal bots
- **Quick start**:
  - `signal-cli -u +NUMBER register`
  - `signal-cli -u +NUMBER verify CODE`
  - `signal-cli -u +NUMBER send -m "Hello" +RECIPIENT`
- **Auth**: Requires Signal account registration. Register with `signal-cli -u +NUMBER register` then verify with the code received via SMS.
- **Docs**: <https://github.com/AsamK/signal-cli/wiki>

## Telegram

## grammy

- **Package**: `npm install grammy`
- **Purpose**: Modern Telegram Bot API framework for Node.js with middleware, sessions, and plugin support
- **Use when**: You need to build a Telegram bot for notifications, commands, inline queries, or interactive conversations
- **Quick start**:
  - `const { Bot } = require('grammy'); const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);`
  - `bot.command('start', ctx => ctx.reply('Hello')); bot.start();`
  - `bot.on('message:text', ctx => ctx.reply('Echo: ' + ctx.message.text));`
- **Auth**: Bot token from @BotFather (`TELEGRAM_BOT_TOKEN` env var)
- **Docs**: <https://grammy.dev/>

## WhatsApp

## @whiskeysockets/baileys

- **Package**: `npm install @whiskeysockets/baileys`
- **Purpose**: WhatsApp Web multi-device API for Node.js, supporting messages, media, groups, and status updates
- **Use when**: You need to send/receive WhatsApp messages programmatically or build WhatsApp integrations
- **Quick start**:
  - `const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');`
  - `const { state, saveCreds } = await useMultiFileAuthState('auth'); const sock = makeWASocket({ auth: state });`
  - `await sock.sendMessage('1234567890@s.whatsapp.net', { text: 'Hello' });`
- **Auth**: QR code pairing via WhatsApp mobile app. On first connection, scan the QR code printed to the terminal with your WhatsApp mobile app.
- **Docs**: <https://github.com/WhiskeySockets/Baileys>

## Discord

## discord.js

- **Package**: `npm install discord.js`
- **Purpose**: Full-featured Discord bot library for Node.js with support for slash commands, voice, embeds, and interactions
- **Use when**: You need to build a Discord bot for moderation, notifications, slash commands, or server automation
- **Quick start**:
  - `const { Client, GatewayIntentBits } = require('discord.js'); const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });`
  - `client.on('ready', () => console.log('Logged in as ' + client.user.tag));`
  - `client.login(process.env.DISCORD_TOKEN);`
- **Auth**: Bot token from Discord Developer Portal (`DISCORD_TOKEN` env var). Create an application at <https://discord.com/developers/applications>, add a bot, and copy the token.
- **Docs**: <https://discord.js.org/>

## Matrix/Element

## matrix-js-sdk

- **Package**: `npm install matrix-js-sdk`
- **Purpose**: Matrix protocol SDK for Node.js, enabling encrypted messaging, room management, and federation
- **Use when**: You need to integrate with Matrix/Element for decentralized messaging, build bots, or bridge to other platforms
- **Quick start**:
  - `const sdk = require('matrix-js-sdk'); const client = sdk.createClient({ baseUrl: 'https://matrix.org', accessToken: TOKEN, userId: '@user:matrix.org' });`
  - `client.startClient(); client.on('Room.timeline', (event) => console.log(event.getContent().body));`
  - `client.sendTextMessage(roomId, 'Hello from Node.js');`
- **Auth**: Matrix homeserver credentials or access token. Generate an access token via Element settings or use username/password login with `client.login('m.login.password', { user, password })`.
- **Docs**: <https://matrix-org.github.io/matrix-js-sdk/>

## Google Workspace

## @googleworkspace/cli

- **Package**: `npm install @googleworkspace/cli`
- **Purpose**: Google Workspace CLI for interacting with Docs, Sheets, Drive, Gmail, and other Google services
- **Use when**: You need to create, read, or modify Google Workspace documents programmatically from the command line
- **Quick start**:
  - `gw auth login`
  - `gw sheets get SPREADSHEET_ID`
  - `gw drive list --query "name contains 'report'"`
- **Auth**: OAuth2 credentials or service account key. Set up credentials at <https://console.cloud.google.com/> and configure via `gw auth login` or `GOOGLE_APPLICATION_CREDENTIALS` env var.
- **Docs**: <https://developers.google.com/workspace>
