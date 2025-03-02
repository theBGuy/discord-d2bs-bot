declare namespace NodeJS {
  interface ProcessEnv {
    PORT: number;
    CLIENT_TOKEN: string;
    CLIENT_ID: string;
    CHANNEL_ID: string;
    NODE_ENV: "development" | "production";
    HOST_ENV: "local" | "docker";
  }
}
