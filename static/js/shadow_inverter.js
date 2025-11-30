// Shadow Inverter - Stealth Reality Game

class ShadowInverterGame {
  constructor() {
    this.canvas = document.getElementById("shadowCanvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.overlay = document.getElementById("shadowOverlay");

    // Game Constants
    this.GRID_SIZE = 20;
    this.TILE_SIZE = 30; // 600px / 20
    this.TICK_RATE = 100; // 10 ticks per second

    // Game State
    this.grid = [];
    this.player = { x: 1, y: 1, dir: 0 }; // 0: up, 1: right, 2: down, 3: left
    this.guards = [];
    this.compute = 100;
    this.stealth = 100;
    this.level = 1;
    this.gameActive = false;
    this.timer = null;
    this.visionMode = "physical"; // "physical" or "noise"
    this.selectedTool = "vision"; // vision, denoise, disguise

    // UI Elements
    this.computeDisplay = document.getElementById("shadowCompute");
    this.stealthDisplay = document.getElementById("shadowStealth");
    this.levelDisplay = document.getElementById("shadowLevel");
    this.msgDisplay = document.getElementById("shadowMessage");
    this.btnStart = document.getElementById("btnStartShadow");

    this.init();
  }

  init() {
    if (this.initialized) return;
    if (!this.canvas) return;
    this.initialized = true;

    // Set canvas size
    this.canvas.width = 600;
    this.canvas.height = 600;

    // Event Listeners
    this.btnStart.addEventListener("click", () => this.startGame());
    this.canvas.addEventListener("click", (e) => this.handleClick(e));
    window.addEventListener("keydown", (e) => this.handleInput(e));

    // Tool selection
    document.querySelectorAll(".tools-grid button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document
          .querySelectorAll(".tools-grid button")
          .forEach((b) => b.classList.remove("active"));
        const target = e.currentTarget;
        target.classList.add("active");
        this.selectedTool = target.dataset.tool;

        if (this.selectedTool === "vision") {
          this.toggleVision();
        } else if (this.selectedTool === "disguise") {
          this.openDisguiseModal();
        }
      });
    });

    // Disguise Modal Logic
    this.disguiseModal = new bootstrap.Modal(
      document.getElementById("disguiseModal")
    );
    this.dCanvas = document.getElementById("disguiseCanvas");
    this.dCtx = this.dCanvas ? this.dCanvas.getContext("2d") : null;
    this.dDrawing = false;

    if (this.dCanvas) {
      this.dCtx.fillStyle = "#fff";
      this.dCtx.fillRect(0, 0, 300, 300);

      this.dCanvas.addEventListener("mousedown", () => (this.dDrawing = true));
      this.dCanvas.addEventListener("mouseup", () => (this.dDrawing = false));
      this.dCanvas.addEventListener(
        "mouseleave",
        () => (this.dDrawing = false)
      );
      this.dCanvas.addEventListener("mousemove", (e) => this.drawDisguise(e));

      document
        .getElementById("btnClearDisguise")
        .addEventListener("click", () => {
          this.dCtx.fillStyle = "#fff";
          this.dCtx.fillRect(0, 0, 300, 300);
        });

      document
        .getElementById("btnRandomDisguise")
        .addEventListener("click", () => this.randomizeDisguise());

      document
        .getElementById("btnConfirmDisguise")
        .addEventListener("click", () => this.generateDisguise());
    }

    this.log("System Online. Awaiting Infiltration Protocol.");
  }

  randomizeDisguise() {
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 300;
      const y = Math.random() * 300;
      const r = Math.random() * 20 + 5;
      this.dCtx.fillStyle = Math.random() < 0.5 ? "#000" : "#888";
      this.dCtx.beginPath();
      this.dCtx.arc(x, y, r, 0, Math.PI * 2);
      this.dCtx.fill();
    }
  }

  // ... (rest of methods) ...

  openDisguiseModal() {
    if (this.compute < 50) {
      this.log("Insufficient Compute for Disguise Generation.");
      return;
    }
    this.disguiseModal.show();
  }

  drawDisguise(e) {
    if (!this.dDrawing) return;
    const rect = this.dCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.dCtx.fillStyle = "#000";
    this.dCtx.beginPath();
    this.dCtx.arc(x, y, 3, 0, Math.PI * 2);
    this.dCtx.fill();
  }

  async generateDisguise() {
    this.log("Generating Hologram...");
    console.log("Starting disguise generation...");

    try {
      const blob = await new Promise((r) => this.dCanvas.toBlob(r));
      console.log("Canvas blob created:", blob);

      if (!blob) {
        throw new Error("Failed to create image from canvas");
      }

      const formData = new FormData();
      formData.append("image", blob);
      formData.append(
        "prompt",
        "cyberpunk hologram texture, glitch art, green matrix code"
      );
      formData.append("guidance_scale", 7.5);
      formData.append("num_steps", 20);

      console.log("Sending request to /api/sketch_to_image...");
      const res = await fetch("/api/sketch_to_image", {
        method: "POST",
        body: formData,
      });
      console.log("Response status:", res.status);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server Error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      console.log("Data received:", data);

      // Create image from base64
      const img = new Image();
      img.onload = () => {
        console.log("Image loaded successfully");
        this.player.disguiseImg = img;
        this.player.disguised = true;
        this.compute -= 50;
        this.disguiseModal.hide();
        this.log("Disguise Active. Guards confused.");
        this.updateUI();
      };
      img.onerror = (e) => {
        console.error("Failed to load generated image", e);
        this.log("Error loading generated hologram.");
      };
      img.src = "data:image/png;base64," + data.generated_image;
    } catch (e) {
      console.error("Generation failed:", e);
      this.log("Generation Failed: " + e.message);
    }
  }

  startGame() {
    if (this.gameActive) return;

    this.gameActive = true;
    this.compute = 100;
    this.stealth = 100;
    this.level = 1;
    this.visionMode = "physical";

    this.generateLevel();

    this.btnStart.textContent = "Mission Active";
    this.btnStart.disabled = true;
    this.log("Infiltration Started. Stay in the shadows.");

    // Start Game Loop
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), this.TICK_RATE);
    this.render();
  }

  generateLevel() {
    // Simple maze generation
    this.grid = [];
    for (let y = 0; y < this.GRID_SIZE; y++) {
      const row = [];
      for (let x = 0; x < this.GRID_SIZE; x++) {
        // Border walls
        if (
          x === 0 ||
          x === this.GRID_SIZE - 1 ||
          y === 0 ||
          y === this.GRID_SIZE - 1
        ) {
          row.push({ type: "wall", noiseType: "wall" });
        } else {
          // Random walls
          if (Math.random() < 0.2) {
            // 50% chance a wall is actually a hidden door in noise layer
            const isHiddenDoor = Math.random() < 0.5;
            row.push({
              type: "wall",
              noiseType: isHiddenDoor ? "door" : "wall",
              revealed: false,
            });
          } else {
            // Random traps in open space
            const isTrap = Math.random() < 0.1;
            row.push({
              type: "floor",
              noiseType: isTrap ? "trap" : "floor",
            });
          }
        }
      }
      this.grid.push(row);
    }

    // Spawn Player
    this.player = { x: 1, y: 1 };
    this.grid[1][1].type = "floor"; // Ensure start is clear

    // Spawn Guards
    this.guards = [
      {
        x: 10,
        y: 10,
        path: [
          { x: 10, y: 10 },
          { x: 15, y: 10 },
        ],
        pathIndex: 0,
        alert: 0,
      },
    ];
  }

  tick() {
    if (!this.gameActive) return;

    // Guard Logic
    this.guards.forEach((guard) => {
      // 1. Move Guard (Patrol)
      if (this.stealth > 0) {
        // Only move if game not over
        const target = guard.path[guard.pathIndex];
        if (guard.x < target.x) guard.x += 0.1;
        if (guard.x > target.x) guard.x -= 0.1;
        if (guard.y < target.y) guard.y += 0.1;
        if (guard.y > target.y) guard.y -= 0.1;

        // Snap to grid if close
        if (
          Math.abs(guard.x - target.x) < 0.1 &&
          Math.abs(guard.y - target.y) < 0.1
        ) {
          guard.x = target.x;
          guard.y = target.y;
          guard.pathIndex = (guard.pathIndex + 1) % guard.path.length;
        }
      }

      // 2. Vision Check (Raycasting)
      if (this.checkLineOfSight(guard, this.player)) {
        this.stealth -= 2; // Drain stealth rapidly
        this.log("WARNING: DETECTED BY GUARD!");
        guard.alert = 10;
      } else {
        if (guard.alert > 0) guard.alert--;
      }
    });

    this.checkGameOver();
    this.updateUI();
    this.render();
  }

  checkLineOfSight(guard, player) {
    // Simple distance check first
    const dx = player.x - guard.x;
    const dy = player.y - guard.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Disguise reduces detection range
    const detectionRange = player.disguised ? 2 : 5;

    if (dist > detectionRange) return false; // Out of range

    // Raycast
    const steps = dist * 2;
    const stepX = dx / steps;
    const stepY = dy / steps;

    let cx = guard.x;
    let cy = guard.y;

    for (let i = 0; i < steps; i++) {
      cx += stepX;
      cy += stepY;

      const gx = Math.round(cx);
      const gy = Math.round(cy);

      if (this.grid[gy][gx].type === "wall") {
        return false; // Blocked by wall
      }
    }

    return true; // Clear line of sight
  }

  handleInput(e) {
    if (!this.gameActive) return;

    let dx = 0;
    let dy = 0;

    if (e.key === "ArrowUp" || e.key === "w") dy = -1;
    if (e.key === "ArrowDown" || e.key === "s") dy = 1;
    if (e.key === "ArrowLeft" || e.key === "a") dx = -1;
    if (e.key === "ArrowRight" || e.key === "d") dx = 1;

    if (dx !== 0 || dy !== 0) {
      this.movePlayer(dx, dy);
    }
  }

  movePlayer(dx, dy) {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (nx >= 0 && nx < this.GRID_SIZE && ny >= 0 && ny < this.GRID_SIZE) {
      const tile = this.grid[ny][nx];

      // Collision Check
      if (tile.type === "wall") {
        this.log("Path Blocked.");
        return;
      }

      this.player.x = nx;
      this.player.y = ny;

      // Trap Check
      if (tile.noiseType === "trap") {
        this.stealth -= 20;
        this.log("TRAP TRIGGERED! Stealth compromised.");
        this.checkGameOver();
      }

      this.render();
    }
  }

  toggleVision() {
    this.visionMode = this.visionMode === "physical" ? "noise" : "physical";
    this.log(`Vision Mode: ${this.visionMode.toUpperCase()}`);

    // Visual effect
    if (this.visionMode === "noise") {
      this.overlay.style.backgroundColor = "rgba(0, 255, 0, 0.1)";
      this.overlay.style.backgroundImage =
        "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzj//v37zaDfv3//MzOzAABGMAvYzne41gAAAABJRU5ErkJggg==')"; // Scanline pattern
    } else {
      this.overlay.style.backgroundColor = "transparent";
      this.overlay.style.backgroundImage = "none";
    }

    this.render();
  }

  handleClick(e) {
    if (!this.gameActive) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / this.TILE_SIZE);

    if (this.selectedTool === "denoise") {
      this.denoiseReality(x, y);
    }
  }

  denoiseReality(x, y) {
    const tile = this.grid[y][x];

    // Can only denoise if we see the noise layer
    if (this.visionMode !== "noise") {
      this.log("Switch to Noise Vision to identify targets.");
      return;
    }

    if (this.compute < 20) {
      this.log("Insufficient Compute.");
      return;
    }

    if (tile.noiseType === "door" && tile.type === "wall") {
      this.compute -= 20;
      tile.type = "floor"; // Reality Shift: Wall becomes Floor
      tile.revealed = true;
      tile.noiseType = "open_door"; // Visual update
      this.log("Reality Shifted: Hidden Path Opened.");
      this.render();
      this.updateUI();
    } else if (tile.noiseType === "trap") {
      this.compute -= 20;
      tile.noiseType = "floor"; // Remove trap
      this.log("Trap Denoised.");
      this.render();
      this.updateUI();
    } else {
      this.log("Nothing to denoise here.");
    }
  }

  updateUI() {
    this.computeDisplay.textContent = this.compute;
    this.stealthDisplay.textContent = this.stealth + "%";
    this.levelDisplay.textContent = this.level;
  }

  checkGameOver() {
    if (this.stealth <= 0) {
      this.gameActive = false;
      clearInterval(this.timer);
      this.btnStart.disabled = false;
      this.btnStart.textContent = "Mission Failed";
      this.log("YOU HAVE BEEN DETECTED. MISSION FAILED.");
    }
  }

  log(msg) {
    this.msgDisplay.textContent = msg;
  }

  render() {
    // Clear
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < this.GRID_SIZE; y++) {
      for (let x = 0; x < this.GRID_SIZE; x++) {
        const tile = this.grid[y][x];
        const px = x * this.TILE_SIZE;
        const py = y * this.TILE_SIZE;

        if (this.visionMode === "physical") {
          // Physical Layer Rendering
          if (tile.type === "wall") {
            this.ctx.fillStyle = "#444";
            this.ctx.fillRect(px, py, this.TILE_SIZE - 1, this.TILE_SIZE - 1);
          } else {
            this.ctx.fillStyle = "#222";
            this.ctx.fillRect(px, py, this.TILE_SIZE - 1, this.TILE_SIZE - 1);
          }
        } else {
          // Noise Layer Rendering (Matrix Style)
          this.ctx.font = "20px monospace";
          if (tile.noiseType === "wall") {
            this.ctx.fillStyle = "#003300";
            this.ctx.fillRect(px, py, this.TILE_SIZE - 1, this.TILE_SIZE - 1);
            this.ctx.fillStyle = "#005500";
            this.ctx.fillText(
              String.fromCharCode(0x30a0 + Math.random() * 96),
              px + 5,
              py + 20
            );
          } else if (tile.noiseType === "door") {
            this.ctx.fillStyle = "#00ff00";
            this.ctx.fillRect(px, py, this.TILE_SIZE - 1, this.TILE_SIZE - 1);
            this.ctx.fillStyle = "#000";
            this.ctx.fillText("DOOR", px + 2, py + 15);
          } else if (tile.noiseType === "open_door") {
            this.ctx.fillStyle = "#00ffff";
            this.ctx.fillRect(px, py, this.TILE_SIZE - 1, this.TILE_SIZE - 1);
            this.ctx.fillStyle = "#000";
            this.ctx.fillText("OPEN", px + 2, py + 15);
          } else if (tile.noiseType === "trap") {
            this.ctx.fillStyle = "#ff0000";
            this.ctx.fillRect(px, py, this.TILE_SIZE - 1, this.TILE_SIZE - 1);
            this.ctx.fillStyle = "#000";
            this.ctx.fillText("TRAP", px + 2, py + 15);
          } else {
            this.ctx.fillStyle = "#001100";
            this.ctx.fillRect(px, py, this.TILE_SIZE - 1, this.TILE_SIZE - 1);
          }
        }
      }
    }

    // Draw Player
    this.ctx.save();
    if (this.player.disguised && this.player.disguiseImg) {
      // Draw Hologram Disguise
      this.ctx.globalAlpha = 0.8;
      this.ctx.drawImage(
        this.player.disguiseImg,
        this.player.x * this.TILE_SIZE,
        this.player.y * this.TILE_SIZE,
        this.TILE_SIZE,
        this.TILE_SIZE
      );
      this.ctx.strokeStyle = "#0f0";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        this.player.x * this.TILE_SIZE,
        this.player.y * this.TILE_SIZE,
        this.TILE_SIZE,
        this.TILE_SIZE
      );
    } else {
      // Normal Player
      this.ctx.fillStyle = "#0ff";
      this.ctx.beginPath();
      this.ctx.arc(
        this.player.x * this.TILE_SIZE + this.TILE_SIZE / 2,
        this.player.y * this.TILE_SIZE + this.TILE_SIZE / 2,
        this.TILE_SIZE / 3,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    }
    this.ctx.restore();

    // Player Label
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "10px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(
      "YOU",
      this.player.x * this.TILE_SIZE + this.TILE_SIZE / 2,
      this.player.y * this.TILE_SIZE - 5
    );

    // Draw Guards
    this.guards.forEach((g) => {
      this.ctx.fillStyle = g.alert > 0 ? "#ff0" : "#f00"; // Yellow if alert
      this.ctx.fillRect(
        g.x * this.TILE_SIZE + 5,
        g.y * this.TILE_SIZE + 5,
        this.TILE_SIZE - 10,
        this.TILE_SIZE - 10
      );

      // Guard Label
      this.ctx.fillStyle = "#f00";
      this.ctx.font = "10px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText(
        "GUARD",
        g.x * this.TILE_SIZE + this.TILE_SIZE / 2,
        g.y * this.TILE_SIZE - 5
      );
    });
  }
}
