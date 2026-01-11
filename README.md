
# HexQuest Economy

**HexQuest Economy** is a strategic hexagonal exploration game where economic management is as crucial as territorial expansion. Compete against AI Sentinels, manage your resources (Coins & Moves), and master the upgrade cycle to dominate the procedural world.

## 🎮 Game Overview

You are a Commander tasked with expanding into a new sector. The world is infinite, procedural, and guarded by AI competitors.

### Core Mechanics

*   **Movement & Resources**:
    *   Moving costs **Moves**.
    *   If you run out of Moves, you must burn **Credits (Coins)** to propel yourself (Exchange Rate: 2 Coins = 1 Move).
    *   Strategic resource management is vital to avoid being stranded.

*   **Growth & Upgrades**:
    *   Stand on a hex and activate **GROWTH** to increase its level.
    *   **Leveling Up** grants Coins and Moves.
    *   **Cycle Lock**: You cannot upgrade the same hex repeatedly. You must rotate your upgrades across different sectors to maintain the "Upgrade Queue".

*   **Rank System**:
    *   Your **Player Level** determines your clearance.
    *   You cannot traverse or upgrade hexes with a level higher than your current Rank.
    *   Level up lower-tier hexes to increase your Rank.

*   **The Staircase Rule (Support)**:
    *   To upgrade a hex to **Level X**, you must have an adjacent neighbor at **Level X-1** or higher.
    *   This prevents building isolated towers and encourages "pyramid" or "staircase" structures.
    *   *Tip: If you cannot grow a hex, ensure you have a supporting neighbor of the required rank.*

*   **Sentinels (AI)**:
    *   Hostile bots inhabit the world. They expand, gather resources, and build complex structures obeying the same rules as you.
    *   Collision with a Sentinel halts your movement.

### Win Conditions
Configurable at the start of a session:
1.  **Wealth**: Accumulate a specific amount of Coins.
2.  **Domination**: Reach a specific high Level (Rank).

---

## 🕹️ Controls

*   **Left Click**: Move to a hex / Select a hex.
*   **Click & Drag**: Pan the camera view.
*   **Right Click & Drag**: Rotate the camera.
*   **Mouse Wheel**: Zoom In / Zoom Out.
*   **HUD Button**: Toggle **GROWTH/UPGRADE** mode.

---

## 🛠️ Installation & Development

This project is built with **React**, **Vite**, **TypeScript**, and **Electron**.

### Prerequisites
*   Node.js (v18 or higher)
*   npm

### 1. Setup
Clone the repository and install dependencies:
```bash
npm install
```

### 2. Web Development Mode
To run the game in a browser for quick UI testing:
```bash
npm run dev
```

### 3. Desktop Development Mode (Electron)
To run the game as a desktop application with hot-reloading:
```bash
npm run electron:dev
```

---

## 📦 Building the Application

To create a standalone executable (`.exe`, `.dmg`, or `.AppImage`) for distribution:

1.  Run the build script:
    ```bash
    npm run electron:build
    ```

2.  Locate the output:
    *   The executable will be generated in the `release/` directory (e.g., `release/HexQuest Setup 2.0.0.exe`).

---

## 📂 Project Structure

*   `src/components`: React UI components (GameView, HUD, Hexagon).
*   `src/gameEngine`: Core logic for Rules (Staircase, Cycle) and AI.
*   `src/services`: Math utilities for Hexagonal grids (q,r coordinates) and Pathfinding.
*   `src/store.ts`: State management (Zustand) handling the game loop.
*   `electron/`: Main process code for the desktop wrapper.

---

*HexQuest Economy v2.1*
