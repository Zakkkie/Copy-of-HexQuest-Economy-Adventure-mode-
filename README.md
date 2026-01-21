
# HexQuest Economy

**HexQuest Economy** is a high-fidelity hexagonal strategy game built with **React**, **Konva**, and **TypeScript**. It combines the thrill of exploring an infinite procedural world with a tight economic simulation where every move and upgrade must be calculated against your limited resources (Credits & Propulsion).

Compete against advanced **AI Sentinels**, manage a delicate balance of **Moves vs. Coins**, and master complex zoning rules to dominate the sector.

---

## 🚀 Key Features

*   **Infinite Procedural World**: A living, breathing hex grid that expands as you explore.
*   **Deep Economic Strategy**: Movement isn't free. Growth isn't guaranteed. Manage your **Credits** and **Moves** carefully to avoid being stranded in deep space.
*   **Competitive AI ("The Survivor" V12)**: Autonomous bots that farm resources, plan expansions, get frustrated, and execute panic maneuvers when trapped.
*   **Procedural Audio Engine**: A custom-built, asset-free sound synthesizer using the Web Audio API for real-time sci-fi SFX.
*   **Visual Fidelity**: A 2.5D isometric view with neon-glass aesthetics, dynamic lighting, and smooth React-Konva animations.
*   **Cross-Session Persistence**: Player profiles, leaderboards, and session resume capabilities.

---

## 📜 The Rules of Engagement

Success in HexQuest requires understanding the laws that govern the simulation.

### 1. Movement & Propulsion
*   **Basic Movement**: Moving to an adjacent hex costs **1 Move**.
*   **Terrain Cost**: High-level hexes are harder to traverse. Moving into a **Level 5** hex costs **5 Moves**.
*   **Emergency Propulsion**: If you lack Moves, you can burn **Credits** to move (Exchange Rate: **2 Credits = 1 Move**).
*   *Warning*: Running out of both Moves and Credits leaves you stranded, forcing a session abort.

### 2. Territorial Growth
You expand by "growing" the hex you are standing on.

*   **Acquisition (L0 → L1)**: Taking over a neutral sector is always allowed (provided you can afford the cost). This is how you claim territory.
*   **Vertical Expansion (Upgrading)**: Increasing a sector's level (e.g., L2 → L3) increases its value and your income, but requires adhering to strict zoning rules.

### 3. Structural Integrity Rules
To prevent "towering" (building a single massive tower), the game enforces structural stability:

*   **The Staircase Rule**: To upgrade a hex to **Level X**, you must have at least **2 neighbors** at **Level X-1** or higher. You cannot build a Level 5 Skyscraper in a Level 1 swamp.
*   **The Valley Rule (Exception)**: If a hex is surrounded by **5 or more** neighbors of a strictly higher level, it lifts the support requirement. This prevents "dead zones" inside highly developed territory, allowing the center to rise.

### 4. The Cycle Lock (Anti-Spam)
You cannot simply spam upgrades on a single hex to power-level.

*   **The Queue**: The system tracks your last N upgrades. You cannot upgrade a hex that is currently in your "Recent Upgrades" queue.
*   **Difficulty Scaling**:
    *   **Cadet (Easy)**: Queue size of 1. (Simple A-B alternation).
    *   **Veteran (Medium)**: Queue size of 2. (Requires A-B-C rotation).
    *   **Elite (Hard)**: Queue size of 3. (Complex A-B-C-D planning required).

### 5. Recovery & Farming
If you are low on resources, you can perform a **Recovery** operation on any hex you own.
*   Instead of upgrading the level, you harvest supplies.
*   **Reward**: Grants **+1 Move** and a significant amount of **Credits** based on the hex level.
*   *Strategy*: High-level hexes yield massive payouts but take longer to recover.

---

## 🤖 The AI: "Sentinel"

The world is populated by AI bots running the **"Survivor V12"** logic engine.

*   **Behavior**: They prioritize survival and economic efficiency. They will establish "farms" (clusters of hexes they cycle between) to generate wealth.
*   **Aggression**: If they detect the player nearby, they may attempt to cut off your path or steal your territory.
*   **Panic Mode**: If a bot gets stuck or trapped, it triggers a "Panic" state, attempting random high-risk moves or suicide runs to break the deadlock.

---

## 🎮 Controls

| Action | Control |
| :--- | :--- |
| **Move / Select** | `Left Click` on a Hex |
| **Pan Camera** | `Left Click` + Drag background |
| **Rotate Camera** | `Right Click` + Drag |
| **Zoom** | `Mouse Wheel` |
| **Growth / Upgrade** | `Amber Button` (HUD) |
| **Recover Supplies** | `Blue Button` (HUD) |
| **Abort / Menu** | `Log Out` Icon (Top Right) |
| **Mute Audio** | `Speaker` Icon (Top Left) |

---

## 🛠️ Technical Stack

*   **Frontend**: React 19, TailwindCSS
*   **Graphics**: Konva (HTML5 Canvas) via `react-konva`
*   **State Management**: Zustand (Separation of Ephemeral Game State vs. UI State)
*   **Desktop Wrapper**: Electron
*   **Build Tool**: Vite

---

## 📦 Installation & Build

### Development
```bash
# Install dependencies
npm install

# Run web version (fastest for UI dev)
npm run dev

# Run Electron desktop version
npm run electron:dev
```

### Production Build
To create a standalone executable (`.exe`, `.dmg`, `.AppImage`):

```bash
npm run electron:build
```
The output will be in the `release/` folder.

---

*HexQuest Economy - v3.1*
