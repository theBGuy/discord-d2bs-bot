import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Client, Events, GatewayIntentBits, type Message, type TextChannel, type ThreadChannel } from "discord.js";
import dotenv from "dotenv";
import net from "net";
import { createClient } from "redis";
import { z } from "zod";

dotenv.config();

const DISCORD_ACCESS_TOKEN = process.env.CLIENT_TOKEN ?? "";
const DISCORD_CLIENT_ID = process.env.CLIENT_ID ?? "";
const DISCORD_CHANNEL_ID = process.env.CHANNEL_ID ?? "";
const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";

if (!DISCORD_ACCESS_TOKEN) {
  throw new Error(`Failed to load client token ${process.env.CLIENT_TOKEN}`);
}

if (!DISCORD_CLIENT_ID) {
  throw new Error(`Failed to load client id ${process.env.CLIENT_ID}`);
}

if (!DISCORD_CHANNEL_ID) {
  throw new Error(`Failed to load channel id ${process.env.CHANNEL_ID}`);
}

const MessageDataSchema = z.object({
  thread: z.string().default("default"),
  message: z.string(),
  isBidirectional: z.boolean().default(false),
  channelId: z.string().optional(),
});

type MessageData = z.infer<typeof MessageDataSchema>;

const QueueItemSchema = MessageDataSchema.pick({
  message: true,
  isBidirectional: true,
  channelId: true,
}).extend({
  threadName: z.string(),
  socketId: z.string(),
});

type QueueItem = z.infer<typeof QueueItemSchema>;

const redisClient = createClient({ url: `redis://${REDIS_HOST}:6379` });
redisClient.on("error", (err) => console.error("Redis Client Error", err));

const connections = new Map<string, net.Socket>();
const activeThreads = new Map<string, net.Socket>();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  shards: "auto",
  failIfNotExists: false,
});

const processQueue = async () => {
  while (true) {
    try {
      const queueItem = await redisClient.lPop("messageQueue");
      if (!queueItem) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before checking the queue again
        continue;
      }

      const { threadName, message, socketId, isBidirectional, channelId } = JSON.parse(queueItem) as QueueItem;
      const socket = connections.get(socketId);
      if (!socket) {
        console.error("Socket not found for ID:", socketId);
        continue;
      }

      const channel = client.channels.cache.get(channelId?.trim() || DISCORD_CHANNEL_ID) as TextChannel;
      if (!channel?.isTextBased()) {
        console.error("Discord channel not found or is not text-based");
        continue;
      }

      let threadChannel = channel.threads.cache.find((t) => t.name === threadName) as ThreadChannel;
      if (!threadChannel) {
        threadChannel = await channel.threads.create({
          name: threadName,
          autoArchiveDuration: 60, // 1 hour
          reason: "New thread for incoming message from d2bs",
        });
        console.log(`Created new thread: ${threadName}`);
      }

      await threadChannel.send(`d2bs client: ${message}`);
      console.log(`Message sent to thread: ${threadName}: ${message}`);
      if (isBidirectional) {
        activeThreads.set(threadChannel.id, socket);
      }
    } catch (err) {
      console.error("Error processing queue item:", err);
      // Small delay before retrying to avoid tight loop on persistent errors
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  processQueue();
});

client.on("messageCreate", (message: Message) => {
  if (message.author.bot) return;

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

const server = net.createServer((socket) => {
  const connectionId = randomUUID();
  socket.id = connectionId;
  const clientIP = socket.remoteAddress;
  console.log(`New connection: ${connectionId} - address: ${clientIP}`);

  // Buffer for handling TCP fragmentation
  let messageBuffer = "";

  let logStream: fs.WriteStream | null = null;
  if (process.env.HOST_ENV !== "docker") {
    if (!fs.existsSync("logs")) {
      fs.mkdirSync("logs");
    }
    logStream = fs.createWriteStream("logs/connections.log", { flags: "a" });
  }

  const processMessage = (data: string): MessageData => {
    try {
      const jsonRegex = /{[\s\S]*?}/g;
      const matches = data.match(jsonRegex);

      if (matches && matches.length > 0) {
        for (const match of matches) {
          try {
            const messageData = JSON.parse(match);
            if (typeof messageData === "string") {
              return { thread: "default", message: messageData, isBidirectional: false };
            }

            const result = MessageDataSchema.parse(messageData);
            if (result) {
              return result;
            }
          } catch (_e) {
            // move on
          }
        }
      }

      console.log(`Treating as plain text: ${data}`);
      return { thread: "default", message: data, isBidirectional: false };
    } catch (err) {
      console.error(`Failed to process message data: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`Raw data: ${data}`);
      return { thread: "default", message: data, isBidirectional: false };
    }
  };

  socket.on("data", async (data) => {
    const timestamp = new Date().toISOString();

    if (logStream) {
      logStream.write(`[${timestamp}] ${clientIP}: ${data}\n`);
    } else if (process.env.HOST_ENV === "docker") {
      console.log(`[${timestamp}] ${clientIP}: ${data}`);
    }

    // Append to buffer and process complete messages
    messageBuffer += data.toString();

    // Process messages delimited by newlines or complete JSON objects
    // Try to extract complete JSON objects from the buffer
    const jsonRegex = /\{[^{}]*\}/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = jsonRegex.exec(messageBuffer)) !== null) {
      const potentialJson = match[0];
      try {
        JSON.parse(potentialJson); // Validate it's complete JSON
        lastIndex = jsonRegex.lastIndex;

        const messageData = processMessage(potentialJson);
        const { thread, message, isBidirectional, channelId } = messageData;
        const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
        console.log("Received data:", message);

        if (channel?.isTextBased()) {
          const dateStr = new Date().toISOString().split("T")[0];
          const threadName = `d2bs-${dateStr}-${thread}`;

          try {
            await redisClient.rPush(
              "messageQueue",
              JSON.stringify({
                threadName,
                message,
                socketId: connectionId,
                isBidirectional,
                channelId,
              }),
            );
          } catch (err) {
            console.error("Failed to push message to Redis queue:", err);
          }
        } else {
          console.error("Discord channel not found or is not text-based");
        }
      } catch (_e) {
        // Incomplete JSON, will try again with more data
      }
    }

    // Keep only unprocessed data in the buffer
    if (lastIndex > 0) {
      messageBuffer = messageBuffer.slice(lastIndex);
    }

    // If buffer doesn't look like it contains JSON, process as plain text
    if (messageBuffer.length > 0 && !messageBuffer.includes("{")) {
      const lines = messageBuffer.split("\n");
      // Process all complete lines (those before the last element)
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          const messageData = processMessage(line);
          const { thread, message, isBidirectional, channelId } = messageData;
          const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
          console.log("Received data:", message);

          if (channel?.isTextBased()) {
            const dateStr = new Date().toISOString().split("T")[0];
            const threadName = `d2bs-${dateStr}-${thread}`;

            try {
              await redisClient.rPush(
                "messageQueue",
                JSON.stringify({
                  threadName,
                  message,
                  socketId: connectionId,
                  isBidirectional,
                  channelId,
                }),
              );
            } catch (err) {
              console.error("Failed to push message to Redis queue:", err);
            }
          }
        }
      }
      // Keep the last incomplete line in the buffer
      messageBuffer = lines[lines.length - 1];
    }
  });

  const cleanup = () => {
    connections.delete(connectionId);

    for (const [threadId, sock] of activeThreads.entries()) {
      if (sock === socket) {
        activeThreads.delete(threadId);
      }
    }

    if (logStream) {
      logStream.end();
      logStream = null;
    }
  };

  socket.on("end", () => {
    console.log(`Client ${connectionId} disconnected`);
    cleanup();
  });

  socket.on("error", (err) => {
    console.error(`Socket error for ${connectionId}:`, err);
    cleanup();
  });

  connections.set(connectionId, socket);
});

// Start
const startServer = async () => {
  const PORT = process.env.PORT ?? 12345;

  await redisClient.connect();
  server.listen(process.env.PORT ?? 12345, () => {
    console.log(`Server listening on port ${PORT}`);
  });
};
startServer();

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
