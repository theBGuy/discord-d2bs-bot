import net from "net";
import fs from "node:fs";
import { Client, Events, GatewayIntentBits, type Message, type TextChannel } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const DISCORD_ACCESS_TOKEN = process.env.CLIENT_TOKEN ?? "";
const DISCORD_CLIENT_ID = process.env.CLIENT_ID ?? "";
const DISCORD_CHANNEL_ID = process.env.CHANNEL_ID ?? "";

if (!DISCORD_ACCESS_TOKEN) {
  throw new Error(`Failed to load client token ${process.env.CLIENT_TOKEN}`);
}

if (!DISCORD_CLIENT_ID) {
  throw new Error(`Failed to load client id ${process.env.CLIENT_ID}`);
}

if (!DISCORD_CHANNEL_ID) {
  throw new Error(`Failed to load client id ${process.env.CLIENT_ID}`);
}

const sentMessages = new Map<string, net.Socket>();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  shards: "auto",
  failIfNotExists: false,
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on("messageCreate", (message: Message) => {
  if (message.author.bot || !message.reference?.messageId) return;

  // Check if the message is a reply to a stored message
  const originalSocket = sentMessages.get(message.reference.messageId);
  if (originalSocket) {
    originalSocket.write(message.content, (err) => {
      if (err) {
        console.error("Failed to send user response through the socket:", err);
      } else {
        console.log("User response sent through the socket:", message.content);
      }
    });
    sentMessages.delete(message.reference.messageId);
  }
});

client.login(DISCORD_ACCESS_TOKEN);

const server = net.createServer((socket) => {
  console.log("Client connected");

  socket.on("data", (data) => {
    const message = data.toString();
    const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
    console.log("Received data:", message);

    if (channel?.isTextBased()) {
      (channel as TextChannel)
        .send(`Received data from d2bs client: ${message}`)
        .then((sentMessage) => {
          sentMessages.set(sentMessage.id, socket);
        })
        .catch((err) => {
          console.error("Failed to send message to Discord channel:", err);
        });
    } else {
      console.error("Discord channel not found or is not text-based");
    }
  });

  socket.on("end", () => {
    console.log("Client disconnected");
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });
});

server.on("connection", (socket) => {
  const clientIP = socket.remoteAddress;
  if (!fs.existsSync("logs")) {
    fs.mkdirSync("logs");
  }
  const logStream = fs.createWriteStream("logs/connections.log", { flags: "a" });

  socket.on("data", (data) => {
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ${clientIP}: ${data}\n`);
  });

  socket.on("end", () => logStream.end());
});

// Start
const PORT = 12345;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
