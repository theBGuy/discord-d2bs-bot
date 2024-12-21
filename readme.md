# Discord D2BS Bot

Welcome to the Discord D2BS Bot project! This bot is designed to integrate with Discord and provide a way for D2BS and Discord to communicate. It utilizes socket connections to let users talk to other players from Discord that are in their games.

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Setup](#setup)
- [Installation](#installation)
- [Contributing](#contributing)
- [License](#license)

## Introduction

The Discord D2BS Bot sets up a communication layer to let d2bs talk to this server and this server talk to discord. You can get realtime chat logs from your bots and respond to messages.

## Features

- **Socket Communication**: Communicate between D2BS and Discord using socket connections.

## Setup

To set up a Discord bot application, follow these steps:

1. **Create a Discord Bot**:
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications).
   - Click on "New Application" and give it a name.
   - Navigate to the "Bot" section and click "Add Bot".
   - Copy the bot token and save it for later.

2. **Configure Bot Permissions**:
   - In the "OAuth2" section, go to the "URL Generator".
   - Select the "bot" scope and the necessary permissions (e.g., `Send Messages`, `Read Message History`).
   - Copy the generated URL and use it to invite the bot to your server.

3. **Configure d2bs.ini**:
   - D2bs has hardened sockets thanks to noah so in order to communicate you will need to open d2bs.ini from your kolbot folder and add a `Hosts` entry under settings like:
    ```ini
    [settings]
    Hosts=localhost
    ```

## Installation

To get started with the Discord D2BS Bot, follow these steps:

1. **Clone the Repository**:
  ```bash
  git clone https://github.com/thebguy/discord-d2bs-bot.git
  ```
2. **Navigate to the Project Directory**:
  ```bash
  cd discord-d2bs-bot
  ```
3. **Install Dependencies**:
  ```bash
  npm install
  ```
4. **Configure the Bot**:
  - Create a `.env` file in the root directory.
  - Add your Discord bot token and other necessary configurations to the `.env` file.
  ```env
  CLIENT_TOKEN=your_discord_bot_token
  CLIENT_ID=your_discord_bot_client_id
  CHANNEL_ID=your_discord_channel_id
  ```
5. **Run the Bot**:
  ```bash
  npm start
  ```

## Contributing

We welcome contributions from the community! If you would like to contribute to this project, please follow these steps:

1. **Fork the Repository**: Click the "Fork" button at the top right of this page.
2. **Clone Your Fork**:
  ```bash
  git clone https://github.com/thebguy/discord-d2bs-bot.git
  ```
3. **Create a Branch**:
  ```bash
  git checkout -b feature/your-feature-name
  ```
4. **Make Your Changes**: Implement your feature or bug fix.
5. **Commit Your Changes**:
  ```bash
  git commit -m "Add your commit message here"
  ```
6. **Push to Your Fork**:
  ```bash
  git push origin feature/your-feature-name
  ```
7. **Create a Pull Request**: Open a pull request on the original repository.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

Thank you for using the Discord D2BS Bot! If you have any questions or need further assistance, feel free to open an issue on GitHub.