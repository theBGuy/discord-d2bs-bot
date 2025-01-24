import net from "net";
import fs from "node:fs";
import { Client, Events, GatewayIntentBits, type Message, type TextChannel, type ThreadChannel } from "discord.js";
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
const activeThreads = new Map<string, net.Socket>();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  shards: "auto",
  failIfNotExists: false,
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on("messageCreate", (message: Message) => {
  if (message.author.bot) return;

  // Check if the message is a reply to a stored message
  // const originalSocket = sentMessages.get(message.reference.messageId);
  // if (originalSocket) {
  //   originalSocket.write(message.content, (err) => {
  //     if (err) {
  //       console.error("Failed to send user response through the socket:", err);
  //     } else {
  //       console.log("User response sent through the socket:", message.content);
  //     }
  //   });
  // }

  if (message.channel.isThread()) {
    const threadChannel = message.channel as ThreadChannel;
    const originalSocket = activeThreads.get(threadChannel.id);
    if (originalSocket) {
      originalSocket.write(message.content, (err) => {
        if (err) {
          console.error("Failed to send message through the socket:", err);
        } else {
          console.log("Message sent through the socket:", message.content);
        }
      });
    } else {
      console.log("No matching socket found");
    }
  }
});

client.login(DISCORD_ACCESS_TOKEN);

type MessageData = {
  thread: string;
  message: string;
  isBidirectional: boolean;
};

const server = net.createServer((socket) => {
  console.log("Client connected");

  const processMessage = (data: string): MessageData => {
    try {
      const messageData: MessageData | string = JSON.parse(data);
      if (typeof messageData === "string") {
        return { thread: "default", message: messageData, isBidirectional: false };
      }
      const { thread, message, isBidirectional } = messageData;
      return { thread: thread ?? "default", message, isBidirectional };
    } catch (err) {
      console.error("Failed to process message data:", err);
      return { thread: "default", message: data, isBidirectional: false };
    }
  };

  socket.on("data", async (data) => {
    const messageData = processMessage(data.toString());
    const { thread, message, isBidirectional } = messageData;
    const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
    console.log("Received data:", message);

    if (channel?.isTextBased()) {
      const textChannel = channel as TextChannel;
      const dateStr = new Date().toISOString().split("T")[0];
      const threadName = `d2bs-${dateStr}-${thread}`;
      let threadChannel = textChannel.threads.cache.find((t) => t.name === threadName) as ThreadChannel;

      if (!threadChannel) {
        try {
          threadChannel = await textChannel.threads.create({
            name: threadName,
            autoArchiveDuration: 60, // 1 hour
            reason: "New thread for incoming message from d2bs",
          });

          console.log(`Created new thread: ${threadName}`);
        } catch (err) {
          console.error("Failed to create thread:", err);
          return;
        }
      }

      threadChannel
        .send(`d2bs client: ${message}`)
        .then((sentMessage) => {
          // sentMessages.set(sentMessage.id, socket);
          if (isBidirectional) {
            activeThreads.set(threadChannel.id, socket);
          }
        })
        .catch((err) => {
          console.error("Failed to send message to Discord thread:", err);
        });
    } else {
      console.error("Discord channel not found or is not text-based");
    }
  });

  socket.on("end", () => {
    console.log("Client disconnected");

    for (const [threadId, sock] of activeThreads.entries()) {
      if (sock === socket) {
        activeThreads.delete(threadId);
      }
    }
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err);

    for (const [threadId, sock] of activeThreads.entries()) {
      if (sock === socket) {
        activeThreads.delete(threadId);
      }
    }
  });
});

server.on("connection", (socket) => {
  const clientIP = socket.remoteAddress;

  if (process.env.HOST_ENV !== "docker") {
    if (!fs.existsSync("logs")) {
      fs.mkdirSync("logs");
    }
    const logStream = fs.createWriteStream("logs/connections.log", { flags: "a" });

    socket.on("data", (data) => {
      const timestamp = new Date().toISOString();
      logStream.write(`[${timestamp}] ${clientIP}: ${data}\n`);
    });

    socket.on("end", () => logStream.end());
  } else {
    socket.on("data", (data) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${clientIP}: ${data}`);
    });
  }
});

// Start
const PORT = 12345;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

const removeOldArchivedThreads = async (textChannel: TextChannel) => {
  try {
    const archivedThreads = await textChannel.threads.fetchArchived();

    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    for (const thread of archivedThreads.threads.values()) {
      if (thread.createdTimestamp && now - thread.createdTimestamp > oneWeek && thread.name.startsWith("d2bs-")) {
        await thread.delete();
        console.log(`Deleted old archived thread: ${thread.name}`);
      }
    }
  } catch (err) {
    console.error("Failed to remove old archived threads:", err);
  }
};

// Schedule old archived threads removal every hour
setInterval(
  async () => {
    const channel = client.channels.cache.get(DISCORD_CHANNEL_ID) as TextChannel;
    if (channel?.isTextBased()) {
      await removeOldArchivedThreads(channel);
    }
  },
  60 * 60 * 1000,
);
