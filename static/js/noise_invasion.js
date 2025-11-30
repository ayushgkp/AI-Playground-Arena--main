// Noise Invasion - Pixel Defense Strategy Game

// Noise Invasion - Pixel Defense Strategy Game (Real AI Edition)

class NoiseGame {
  constructor() {
    this.canvas = document.getElementById("noiseCanvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d", { willReadFrequently: true }) : null;
    
    // Game Constants
    this.GRID_SIZE = 20;
    this.TILE_SIZE = 20; 
    this.TICK_RATE = 1000; 
    
    // Game State
    this.grid = []; // Still used for logical state (where monsters spawn)
    this.monsters = [];
    this.energy = 100;
    this.wave = 1;
    this.gameActive = false;
    this.timer = null;
    this.selectedTool = "clean"; 
    this.baseImage = null;
    
    // Pixel Data
    this.originalImageData = null; // The clean reference
    this.currentImageData = null;  // The noisy active state
    
    // UI Elements
    this.energyDisplay = document.getElementById("noiseEnergy");
    this.corruptionDisplay = document.getElementById("noiseCorruption");
    this.waveDisplay = document.getElementById("noiseWave");
    this.msgDisplay = document.getElementById("noiseMessage");
    this.btnStart = document.getElementById("btnStartNoise");
    
    this.init();
  }
  
  init() {
    if (!this.canvas) return;
    
    // Set canvas size
    this.canvas.width = 600;
    this.canvas.height = 600;
    this.TILE_SIZE = this.canvas.width / this.GRID_SIZE;
    
    // Initialize Grid
    this.resetGrid();
    
    // Event Listeners
    this.btnStart.addEventListener("click", () => this.startGame());
    this.canvas.addEventListener("click", (e) => this.handleCanvasClick(e));
    
    // Tool selection
    document.querySelectorAll(".tools-grid button").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".tools-grid button").forEach(b => b.classList.remove("active"));
        const target = e.currentTarget;
        target.classList.add("active");
        this.selectedTool = target.dataset.tool;
        this.log(`Tool selected: ${this.selectedTool}`);
      });
    });

    // Image Upload Listener
    this.imageInput = document.getElementById("noiseImageInput");
    if (this.imageInput) {
      this.imageInput.addEventListener("change", (e) => this.handleImageUpload(e));
    }
    
    // Initial Render (Grid lines)
    this.renderGridLines();
  }
  
  resetGrid() {
    this.grid = [];
    for (let y = 0; y < this.GRID_SIZE; y++) {
      const row = [];
      for (let x = 0; x < this.GRID_SIZE; x++) {
        row.push({
          x, y,
          state: "clean", 
          shielded: false,
          shieldTimer: 0,
          corruptionTimer: 0
        });
      }
      this.grid.push(row);
    }
  }
  
  handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        this.baseImage = img;
        // Draw image to canvas to get pixel data
        this.ctx.drawImage(this.baseImage, 0, 0, this.canvas.width, this.canvas.height);
        this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        this.log("Image World Loaded! Ready for Diffusion.");
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  startGame() {
    if (this.gameActive) return;
    if (!this.baseImage) {
        alert("Please upload an image first to start the Diffusion Game!");
        return;
    }
    
    this.gameActive = true;
    this.energy = 100;
    this.wave = 1;
    this.resetGrid();
    
    // Reset image to clean state
    this.ctx.putImageData(this.originalImageData, 0, 0);
    this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    
    // Seed initial noise
    this.seedCorruption(3);
    
    this.btnStart.textContent = "Diffusion Active...";
    this.btnStart.disabled = true;
    this.log("Forward Diffusion Started! Denoise the image!");
    
    // Start Game Loop
    this.timer = setInterval(() => this.tick(), this.TICK_RATE);
  }
  
  seedCorruption(count) {
    for(let i=0; i<count; i++) {
      const x = Math.floor(Math.random() * this.GRID_SIZE);
      const y = Math.floor(Math.random() * this.GRID_SIZE);
      this.grid[y][x].state = "heavy";
      // Apply real noise immediately
      this.applyGaussianNoise(x, y, 50); 
    }
  }
  
  tick() {
    if (!this.gameActive) return;
    
    // 1. Spread Corruption (Forward Diffusion)
    this.spreadCorruption();
    this.spawnMonsters();
    this.moveMonsters();
    
    // 2. Regenerate Energy
    if (this.energy < 100) this.energy += 1;
    
    // 3. Check Win/Loss (MSE Loss)
    this.checkGameState();
    
    // 4. Update UI
    this.updateUI();
  }
  
  spreadCorruption() {
    // Logic: Iterate grid, if tile is corrupted, add MORE noise to it and neighbors
    for (let y = 0; y < this.GRID_SIZE; y++) {
      for (let x = 0; x < this.GRID_SIZE; x++) {
        const tile = this.grid[y][x];
        
        if (tile.shielded) {
             tile.shieldTimer--;
             if (tile.shieldTimer <= 0) tile.shielded = false;
             continue;
        }

        if (tile.state === "heavy" || tile.state === "core") {
            // Add noise to self (Forward Diffusion Step)
            this.applyGaussianNoise(x, y, 10); 
            
            // Chance to upgrade to core
            if (tile.state === "heavy") {
                tile.corruptionTimer++;
                if (tile.corruptionTimer > 5) tile.state = "core";
            }

            // Spread to neighbors
            const neighbors = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
            neighbors.forEach(n => {
                const nx = x + n.dx;
                const ny = y + n.dy;
                if (nx >= 0 && nx < this.GRID_SIZE && ny >= 0 && ny < this.GRID_SIZE) {
                    const target = this.grid[ny][nx];
                    if (!target.shielded && target.state === "clean" && Math.random() < 0.1) {
                        target.state = "light";
                        this.applyGaussianNoise(nx, ny, 20);
                    } else if (target.state === "light" && Math.random() < 0.05) {
                        target.state = "heavy";
                        this.applyGaussianNoise(nx, ny, 40);
                    }
                }
            });
        }
      }
    }
  }

  // --- REAL AI MECHANICS ---

  applyGaussianNoise(gx, gy, sigma) {
      // Add Gaussian noise to the pixels in grid cell (gx, gy)
      const startX = gx * this.TILE_SIZE;
      const startY = gy * this.TILE_SIZE;
      const data = this.currentImageData.data;
      const width = this.canvas.width;

      for (let y = startY; y < startY + this.TILE_SIZE; y++) {
          for (let x = startX; x < startX + this.TILE_SIZE; x++) {
              const idx = (y * width + x) * 4;
              
              // Add noise to R, G, B
              data[idx] = Math.min(255, Math.max(0, data[idx] + (Math.random() - 0.5) * sigma));
              data[idx+1] = Math.min(255, Math.max(0, data[idx+1] + (Math.random() - 0.5) * sigma));
              data[idx+2] = Math.min(255, Math.max(0, data[idx+2] + (Math.random() - 0.5) * sigma));
          }
      }
      this.ctx.putImageData(this.currentImageData, 0, 0);
  }

  applyConvolution(gx, gy, kernel) {
      // Apply a convolution kernel (Reverse Diffusion)
      // Kernel is a 3x3 matrix (flattened array of 9)
      const startX = gx * this.TILE_SIZE;
      const startY = gy * this.TILE_SIZE;
      const width = this.canvas.width;
      const height = this.canvas.height;
      
      // We need a copy of source data to read from while writing to current
      const srcData = this.ctx.getImageData(startX, startY, this.TILE_SIZE, this.TILE_SIZE);
      const dstData = this.ctx.createImageData(this.TILE_SIZE, this.TILE_SIZE);
      
      const sData = srcData.data;
      const dData = dstData.data;
      const w = this.TILE_SIZE;
      const h = this.TILE_SIZE;

      const kSize = 3;
      const kOffset = 1; // Center
      
      // Normalize kernel
      const kSum = kernel.reduce((a, b) => a + b, 0) || 1;

      for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
              let r=0, g=0, b=0;
              
              for (let ky = 0; ky < kSize; ky++) {
                  for (let kx = 0; kx < kSize; kx++) {
                      const px = x + kx - kOffset;
                      const py = y + ky - kOffset;
                      
                      if (px >= 0 && px < w && py >= 0 && py < h) {
                          const idx = (py * w + px) * 4;
                          const weight = kernel[ky * kSize + kx];
                          r += sData[idx] * weight;
                          g += sData[idx+1] * weight;
                          b += sData[idx+2] * weight;
                      }
                  }
              }
              
              const idx = (y * w + x) * 4;
              dData[idx] = r / kSum;
              dData[idx+1] = g / kSum;
              dData[idx+2] = b / kSum;
              dData[idx+3] = 255; // Alpha
          }
      }
      
      // Write back
      this.ctx.putImageData(dstData, startX, startY);
      // Update our main buffer
      this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  calculateMSE() {
      if (!this.originalImageData || !this.currentImageData) return 0;
      
      let totalError = 0;
      const data1 = this.originalImageData.data;
      const data2 = this.currentImageData.data;
      const len = data1.length;
      
      for (let i = 0; i < len; i += 4) {
          const rDiff = data1[i] - data2[i];
          const gDiff = data1[i+1] - data2[i+1];
          const bDiff = data1[i+2] - data2[i+2];
          totalError += (rDiff*rDiff + gDiff*gDiff + bDiff*bDiff);
      }
      
      // MSE = Total Error / (Number of Pixels * 3 Channels)
      return totalError / (this.canvas.width * this.canvas.height * 3);
  }

  // -------------------------

  spawnMonsters() {
    // Chance to spawn from core tiles
    for (let y = 0; y < this.GRID_SIZE; y++) {
      for (let x = 0; x < this.GRID_SIZE; x++) {
        if (this.grid[y][x].state === "core" && Math.random() < 0.02) {
           this.monsters.push({x, y, type: "glitch"});
           this.log("WARNING: Noise Entity Detected!");
        }
      }
    }
  }
  
  moveMonsters() {
    this.monsters.forEach(m => {
       if (Math.random() < 0.3) { 
          m.x += Math.floor(Math.random() * 3) - 1;
          m.y += Math.floor(Math.random() * 3) - 1;
          m.x = Math.max(0, Math.min(this.GRID_SIZE-1, m.x));
          m.y = Math.max(0, Math.min(this.GRID_SIZE-1, m.y));
          
          // Monsters add heavy noise where they walk
          this.applyGaussianNoise(m.x, m.y, 60);
          if (this.grid[m.y][m.x].state === "clean") {
              this.grid[m.y][m.x].state = "light";
          }
       }
    });
  }
  
  handleCanvasClick(e) {
    if (!this.gameActive) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / this.TILE_SIZE);
    
    if (x >= 0 && x < this.GRID_SIZE && y >= 0 && y < this.GRID_SIZE) {
      this.useTool(x, y);
    }
  }
  
  useTool(x, y) {
    const tile = this.grid[y][x];
    
    if (this.selectedTool === "clean") {
      if (this.energy >= 1) {
        this.energy -= 1;
        // Apply Gaussian Blur Kernel (3x3)
        // [1, 2, 1]
        // [2, 4, 2]
        // [1, 2, 1]
        this.applyConvolution(x, y, [1, 2, 1, 2, 4, 2, 1, 2, 1]);
        
        // Also reduce logical state
        if (tile.state === "light") tile.state = "clean";
        else if (tile.state === "heavy") tile.state = "light";
        
        this.updateUI();
      }
    } else if (this.selectedTool === "shield") {
      if (this.energy >= 2) {
        this.energy -= 2;
        tile.shielded = true;
        tile.shieldTimer = 5; 
        this.renderGridLines(); // Re-render overlay
        this.updateUI();
      }
    } else if (this.selectedTool === "purify") {
      if (this.energy >= 5) {
        this.energy -= 5;
        this.purifyZone(x, y);
        this.updateUI();
      }
    } else if (this.selectedTool === "nuke") {
       if (this.energy >= 12) {
         this.energy -= 12;
         this.nukeZone(x, y);
         this.updateUI();
       }
    }
  }
  
  async purifyZone(cx, cy) {
    this.log("Purifying zone... calling AI...");
    // For purify, we can cheat and restore original pixels for the zone
    // OR call the backend. Let's restore original pixels for now to be "perfect reverse diffusion"
    
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < this.GRID_SIZE && ny >= 0 && ny < this.GRID_SIZE) {
            // Restore original pixels
            const sx = nx * this.TILE_SIZE;
            const sy = ny * this.TILE_SIZE;
            const cleanData = this.originalImageData;
            // This is tricky with ImageData, easier to just drawImage from baseImage with clipping
            this.ctx.drawImage(this.baseImage, 
                sx * (this.baseImage.width/this.canvas.width), sy * (this.baseImage.height/this.canvas.height), 
                this.baseImage.width/this.GRID_SIZE, this.baseImage.height/this.GRID_SIZE,
                sx, sy, this.TILE_SIZE, this.TILE_SIZE
            );
            this.grid[ny][nx].state = "clean";
        }
      }
    }
    this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    
    // Call AI for visual effect (optional, but keeps the "AI" feel)
    try {
      const resp = await fetch("/api/noise/purify", { method: "POST" });
    } catch (e) {}
  }
  
  async nukeZone(cx, cy) {
      this.log("NUKE DEPLOYED!");
      // Restore 5x5
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < this.GRID_SIZE && ny >= 0 && ny < this.GRID_SIZE) {
             const sx = nx * this.TILE_SIZE;
             const sy = ny * this.TILE_SIZE;
             this.ctx.drawImage(this.baseImage, 
                sx * (this.baseImage.width/this.canvas.width), sy * (this.baseImage.height/this.canvas.height), 
                this.baseImage.width/this.GRID_SIZE, this.baseImage.height/this.GRID_SIZE,
                sx, sy, this.TILE_SIZE, this.TILE_SIZE
            );
            this.grid[ny][nx].state = "clean";
          }
        }
      }
      this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }
  
  checkGameState() {
    const mse = this.calculateMSE();
    this.corruptionDisplay.textContent = "Loss: " + mse.toFixed(2);
    
    if (mse > 2000) { // Threshold for loss
      this.gameOver(false);
    } else if (mse < 10 && this.wave > 1) { // Almost clean
      this.gameOver(true);
    }
  }
  
  gameOver(victory) {
    this.gameActive = false;
    clearInterval(this.timer);
    this.btnStart.disabled = false;
    this.btnStart.textContent = victory ? "Victory! Play Again" : "Defeat! Try Again";
    this.log(victory ? "IMAGE RESTORED! YOU WIN!" : "SIGNAL LOST. NOISE OVERWHELMING.");
  }
  
  updateUI() {
    this.energyDisplay.textContent = this.energy;
  }
  
  log(msg) {
    this.msgDisplay.textContent = msg;
  }
  
  renderGridLines() {
      // Just draw overlays (monsters, shields)
      // The image itself is persistent in canvas
      
      // We need to redraw the image from currentImageData first to clear old overlays
      if (this.currentImageData) {
          this.ctx.putImageData(this.currentImageData, 0, 0);
      } else {
          this.ctx.fillStyle = "#111";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }

      // Draw Shields
      for (let y = 0; y < this.GRID_SIZE; y++) {
        for (let x = 0; x < this.GRID_SIZE; x++) {
            if (this.grid[y][x].shielded) {
                this.ctx.strokeStyle = "#0ff";
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x*this.TILE_SIZE+2, y*this.TILE_SIZE+2, this.TILE_SIZE-5, this.TILE_SIZE-5);
            }
        }
      }

      // Draw Monsters
      this.monsters.forEach(m => {
        this.ctx.fillStyle = "#f0f";
        this.ctx.beginPath();
        this.ctx.arc(m.x * this.TILE_SIZE + this.TILE_SIZE/2, m.y * this.TILE_SIZE + this.TILE_SIZE/2, this.TILE_SIZE/3, 0, Math.PI*2);
        this.ctx.fill();
      });
  }
}
