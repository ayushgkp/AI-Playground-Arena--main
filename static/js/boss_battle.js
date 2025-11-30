// Boss Battle Game Logic - Invisible Weak Points Edition

class BossBattle {
  constructor() {
    this.canvas = document.getElementById("bossCanvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    
    // Game state
    this.timeLimit = 60;
    this.timeRemaining = 60;
    this.evolution = 50;  // 0-100 (50 = neutral, <0 = victory, >100 = defeat)
    this.detections = [];
    this.bossImage = null;
    this.timer = null;
    this.gameActive = false;
    this.currentScore = 0;
    this.weakParts = []; // Array of weak body parts
    
    // UI elements
    this.timerDisplay = document.getElementById("bossTimer");
    this.evolutionBar = document.getElementById("evolutionBar");
    this.evolutionPercent = document.getElementById("evolutionPercent");
    this.targetDisplay = document.getElementById("targetObjects");
    this.scoreDisplay = document.getElementById("currentScore");
    this.resultDiv = document.getElementById("bossResult");
    
    // Buttons
    this.btnStart = document.getElementById("btnStartBattle");
    this.btnReset = document.getElementById("btnResetBattle");
    
    // Attack button removed - we click directly now!
    const btnAttack = document.getElementById("btnAttackBoss");
    if(btnAttack) btnAttack.style.display = "none"; 
    
    this.init();
  }
  
  init() {
    if (this.initialized) return;
    if (!this.canvas || !this.ctx) {
      console.error("Boss canvas not found!");
      return;
    }
    this.initialized = true;
    
    // Set canvas size
    this.canvas.width = 800;
    this.canvas.height = 450;
    
    // Button listeners
    this.btnStart.addEventListener("click", () => this.start());
    this.btnReset.addEventListener("click", () => this.reset());
    
    // Upload listeners
    this.btnUpload = document.getElementById("btnUploadBoss");
    this.fileInput = document.getElementById("bossUploadInput");
    
    if (this.btnUpload && this.fileInput) {
      this.btnUpload.addEventListener("click", () => this.fileInput.click());
      this.fileInput.addEventListener("change", (e) => this.handleUpload(e));
    }
    
    this.btnAnalyze = document.getElementById("btnAnalyzeBoss");
    if (this.btnAnalyze) {
      this.btnAnalyze.addEventListener("click", () => this.handleAnalyze());
    }
    
    // Canvas click listener
    this.canvas.addEventListener("click", (e) => this.handleCanvasClick(e));
  }
  
  async handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("image", file);
    
    try {
      this.btnUpload.disabled = true;
      this.btnUpload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
      
      const resp = await fetch("/api/boss/upload", {
        method: "POST",
        body: formData
      });
      
      if (!resp.ok) throw new Error("Upload failed");
      
      const data = await resp.json();
      console.log("Upload success:", data);
      
      // Reset input
      this.fileInput.value = "";
      this.btnUpload.innerHTML = '<i class="fa-solid fa-check"></i> Uploaded!';
      
      // Auto-start battle with new image
      setTimeout(() => {
        this.btnUpload.disabled = false;
        this.btnUpload.innerHTML = '<i class="fa-solid fa-upload"></i> Upload Boss';
        this.start();
      }, 1000);
      
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload boss image");
      this.btnUpload.disabled = false;
      this.btnUpload.innerHTML = '<i class="fa-solid fa-upload"></i> Upload Boss';
    }
  }

  async handleAnalyze() {
    try {
      this.btnAnalyze.disabled = true;
      this.btnAnalyze.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
      
      const resp = await fetch("/api/boss/analyze", { method: "POST" });
      if (!resp.ok) throw new Error("Analysis failed");
      
      const data = await resp.json();
      
      // Show overlay
      const img = new Image();
      img.onload = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Draw centered like renderBoss
        const scale = Math.min(
          this.canvas.width / img.width,
          this.canvas.height / img.height
        );
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (this.canvas.width - w) / 2;
        const y = (this.canvas.height - h) / 2;
        
        this.ctx.drawImage(img, x, y, w, h);
        
        // Add text
        this.ctx.fillStyle = "#00e5a8";
        this.ctx.font = "bold 20px sans-serif";
        this.ctx.fillText("SEGMENTATION ANALYSIS", x + 10, y + 30);
      };
      img.src = "data:image/jpeg;base64," + data.overlay_image;
      
      this.btnAnalyze.innerHTML = '<i class="fa-solid fa-check"></i> Done';
      setTimeout(() => {
        this.btnAnalyze.disabled = false;
        this.btnAnalyze.innerHTML = '<i class="fa-solid fa-microscope"></i> Analyze (SegNet)';
      }, 2000);
      
    } catch (error) {
      console.error(error);
      alert("Analysis failed: " + error.message);
      this.btnAnalyze.disabled = false;
      this.btnAnalyze.innerHTML = '<i class="fa-solid fa-microscope"></i> Analyze (SegNet)';
    }
  }
  
  async start() {
    console.log("Starting boss battle...");
    
    this.btnStart.disabled = true;
    this.btnReset.disabled = false;
    
    // Reset state
    this.timeRemaining = this.timeLimit;
    this.evolution = 50;
    this.currentScore = 0;
    this.gameActive = true;
    this.resultDiv.classList.add("d-none");
    
    // Randomize Weak Points (approx 33% weak, 66% armor)
    const allParts = ["head", "torso", "left_arm", "right_arm", "left_leg", "right_leg"];
    
    // Shuffle array
    for (let i = allParts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allParts[i], allParts[j]] = [allParts[j], allParts[i]];
    }
    
    // Pick first 2 as Weak Points, rest are Armor
    this.weakParts = allParts.slice(0, 2);
    console.log("Weak Points:", this.weakParts);
    
    try {
      const resp = await fetch("/api/boss/start");
      
      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }
      
      const data = await resp.json();
      
      this.bossImage = data.image;
      this.detections = data.detections;
      
      // Update UI - Cryptic hint
      this.targetDisplay.innerHTML = `Find the <span class="accent">2 WEAK POINTS</span>! (4 parts are armored)`;
      this.updateScoreDisplay();
      
      await this.renderBoss();
      this.startTimer();
      
    } catch (error) {
      console.error("Failed to start:", error);
      alert("Failed to start battle: " + error.message);
      this.btnStart.disabled = false;
    }
  }
  
  async renderBoss() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Draw image scaled to canvas
        const scale = Math.min(
          this.canvas.width / img.width,
          this.canvas.height / img.height
        );
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (this.canvas.width - w) / 2;
        const y = (this.canvas.height - h) / 2;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, x, y, w, h);
        
        this.imageScale = scale;
        this.imageOffset = { x, y };
        
        // Draw the targeting schematic
        this.drawWeakPoints();
        
        resolve();
      };
      img.src = "data:image/jpeg;base64," + this.bossImage;
    });
  }
  
  drawWeakPoints() {
    const scale = this.imageScale;
    const offset = this.imageOffset;
    
    this.ctx.save();
    
    // 1. Handle No Detections
    if (!this.detections || this.detections.length === 0) {
      this.ctx.fillStyle = "red";
      this.ctx.font = "bold 24px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText("NO TARGETS DETECTED", this.canvas.width/2, this.canvas.height/2);
      this.ctx.restore();
      return;
    }
    
    this.detections.forEach((det) => {
      const [x1, y1, x2, y2] = det.bbox;
      const sx = x1 * scale + offset.x;
      const sy = y1 * scale + offset.y;
      const sw = (x2 - x1) * scale;
      const sh = (y2 - y1) * scale;
      
      // Force Synthetic Skeleton if Person but no Keypoints
      if (det.label === "person" && !det.keypoints) {
        det.keypoints = this.generateSyntheticSkeleton(x1, y1, x2, y2);
        det.isSynthetic = true; // Mark as synthetic
      }
      
      // 2. Draw Bounding Box
      this.ctx.shadowColor = "#00e5a8";
      this.ctx.shadowBlur = 15;
      this.ctx.strokeStyle = "#00e5a8"; 
      this.ctx.lineWidth = 4;
      this.ctx.strokeRect(sx, sy, sw, sh);
      this.ctx.shadowBlur = 0;
      
      // 3. Draw Skeleton
      if (det.keypoints) {
        this.ctx.save();
        if (det.isSynthetic) {
            this.ctx.setLineDash([5, 5]); // Dashed lines for simulated skeleton
            this.ctx.globalAlpha = 0.7;
        }
        this.drawSkeleton(det.keypoints, scale, offset);
        this.ctx.restore();
      }
      
      // 4. Draw Label
      this.ctx.fillStyle = "#00e5a8";
      this.ctx.font = "bold 14px sans-serif";
      this.ctx.fillText(det.label.toUpperCase() + (det.isSynthetic ? " (SIMULATED)" : ""), sx, sy - 10);
    });
    
    this.ctx.restore();
  }
  
  generateSyntheticSkeleton(x1, y1, x2, y2) {
    // Create fake keypoints based on bounding box
    // YOLO format: [x, y, conf]
    const w = x2 - x1;
    const h = y2 - y1;
    const cx = x1 + w/2;
    
    return [
      [cx, y1 + h*0.15, 1], // 0: Nose (Head)
      [0,0,0], [0,0,0], [0,0,0], [0,0,0], // 1-4: Eyes/Ears (Skip)
      [cx - w*0.2, y1 + h*0.25, 1], // 5: L-Shoulder
      [cx + w*0.2, y1 + h*0.25, 1], // 6: R-Shoulder
      [cx - w*0.25, y1 + h*0.45, 1], // 7: L-Elbow
      [cx + w*0.25, y1 + h*0.45, 1], // 8: R-Elbow
      [cx - w*0.3, y1 + h*0.6, 1], // 9: L-Wrist
      [cx + w*0.3, y1 + h*0.6, 1], // 10: R-Wrist
      [cx - w*0.15, y1 + h*0.55, 1], // 11: L-Hip
      [cx + w*0.15, y1 + h*0.55, 1], // 12: R-Hip
      [cx - w*0.2, y1 + h*0.75, 1], // 13: L-Knee
      [cx + w*0.2, y1 + h*0.75, 1], // 14: R-Knee
      [cx - w*0.2, y1 + h*0.95, 1], // 15: L-Ankle
      [cx + w*0.2, y1 + h*0.95, 1]  // 16: R-Ankle
    ];
  }
  
  drawSkeleton(kps, scale, offset) {
    // Helper to get scaled point
    const getP = (i) => {
      const x = kps[i][0];
      const y = kps[i][1];
      if (x === 0 && y === 0) return null;
      return {
        x: x * scale + offset.x,
        y: y * scale + offset.y
      };
    };
    
    // Connections to draw
    const chains = [
      [5, 7, 9],       // Left Arm
      [6, 8, 10],      // Right Arm
      [11, 13, 15],    // Left Leg
      [12, 14, 16],    // Right Leg
      [5, 6],          // Shoulders
      [11, 12],        // Hips
      [5, 11],         // Left Body
      [6, 12]          // Right Body
    ];
    
    this.ctx.strokeStyle = "cyan";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    
    chains.forEach(chain => {
      let start = getP(chain[0]);
      for (let i = 1; i < chain.length; i++) {
        const end = getP(chain[i]);
        if (start && end) {
          this.ctx.moveTo(start.x, start.y);
          this.ctx.lineTo(end.x, end.y);
          start = end;
        } else {
          start = null;
        }
      }
    });
    this.ctx.stroke();
    
    // Draw Joints
    this.ctx.fillStyle = "white";
    for (let i = 0; i < kps.length; i++) {
      const p = getP(i);
      if (p) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  handleCanvasClick(e) {
    if (!this.gameActive) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    this.drawClickEffect(clickX, clickY);
    
    const scale = this.imageScale;
    const offset = this.imageOffset;
    
    let hit = false;
    let critical = false;
    let message = "MISS";
    
    // Helper: Distance squared from point p to segment vw
    function distToSegmentSquared(p, v, w) {
      const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
      if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
      let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
    }
    
    function distToSegment(p, v, w) { return Math.sqrt(distToSegmentSquared(p, v, w)); }

    // Check collisions
    for (let det of this.detections) {
      if (det.keypoints) {
        const imgClick = { x: (clickX - offset.x) / scale, y: (clickY - offset.y) / scale };
        const kps = det.keypoints;
        const getK = (i) => ({ x: kps[i][0], y: kps[i][1] });
        const HIT_THRESHOLD = 25;
        
        let hitPart = null;
        
        // 1. Check Head
        const nose = getK(0);
        if (Math.sqrt((imgClick.x - nose.x)**2 + (imgClick.y - nose.y)**2) < 40) {
          hitPart = "head";
        }
        
        // 2. Check Torso
        if (!hitPart) {
          const torsoBones = [[5, 11], [6, 12], [5, 6], [11, 12]];
          for (let bone of torsoBones) {
            if (distToSegment(imgClick, getK(bone[0]), getK(bone[1])) < HIT_THRESHOLD) {
              hitPart = "torso"; break;
            }
          }
          // Spine check
          const midShoulder = { x: (getK(5).x + getK(6).x)/2, y: (getK(5).y + getK(6).y)/2 };
          const midHip = { x: (getK(11).x + getK(12).x)/2, y: (getK(11).y + getK(12).y)/2 };
          if (!hitPart && distToSegment(imgClick, midShoulder, midHip) < HIT_THRESHOLD * 1.5) hitPart = "torso";
        }
        
        // 3. Check Arms (Left: 5-7-9, Right: 6-8-10)
        if (!hitPart) {
          if (distToSegment(imgClick, getK(5), getK(7)) < HIT_THRESHOLD || distToSegment(imgClick, getK(7), getK(9)) < HIT_THRESHOLD) hitPart = "left_arm";
          else if (distToSegment(imgClick, getK(6), getK(8)) < HIT_THRESHOLD || distToSegment(imgClick, getK(8), getK(10)) < HIT_THRESHOLD) hitPart = "right_arm";
        }
        
        // 4. Check Legs (Left: 11-13-15, Right: 12-14-16)
        if (!hitPart) {
          if (distToSegment(imgClick, getK(11), getK(13)) < HIT_THRESHOLD || distToSegment(imgClick, getK(13), getK(15)) < HIT_THRESHOLD) hitPart = "left_leg";
          else if (distToSegment(imgClick, getK(12), getK(14)) < HIT_THRESHOLD || distToSegment(imgClick, getK(14), getK(16)) < HIT_THRESHOLD) hitPart = "right_leg";
        }
        
        if (hitPart) {
          hit = true;
          if (this.weakParts.includes(hitPart)) {
            critical = true;
            message = "CRITICAL HIT!";
          } else {
            message = "ARMOR HIT!";
          }
          break;
        }
        
      } else {
        // Fallback for non-pose objects
        const [x1, y1, x2, y2] = det.bbox;
        const sx = x1 * scale + offset.x;
        const sy = y1 * scale + offset.y;
        const sw = (x2 - x1) * scale;
        const sh = (y2 - y1) * scale;
        
        if (clickX >= sx && clickX <= sx + sw && clickY >= sy && clickY <= sy + sh) {
          hit = true;
          critical = true;
          message = "WEAK POINT!";
          break;
        }
      }
    }
    
    this.processHit(hit, critical, message, clickX, clickY);
  }
  
  processHit(hit, critical, message, x, y) {
    if (critical) {
      // Critical Hit: Huge reward
      this.evolution -= 25;
      this.currentScore += 2000;
      this.showFloatingText(message, x, y, "#00e5a8"); // Green
    } else if (hit) {
      // Armor Hit: HIGH PENALTY (Hardcore Mode)
      // 4 hits = Game Over (approx)
      this.evolution += 15; 
      this.currentScore -= 200;
      this.showFloatingText(message, x, y, "#ffaa00"); // Orange
    } else {
      // Miss: EXTREME PENALTY
      this.evolution += 25;
      this.currentScore -= 500;
      this.showFloatingText("MISS", x, y, "#ff4dff"); // Purple
    }
    
    this.evolution = Math.max(0, Math.min(100, this.evolution));
    this.updateEvolutionBar();
    this.updateScoreDisplay();
    
    if (this.evolution <= 0) this.victory();
    else if (this.evolution >= 100) this.defeat();
  }
  
  drawClickEffect(x, y) {
    // Simple ripple effect
    this.ctx.strokeStyle = "white";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 10, 0, Math.PI * 2);
    this.ctx.stroke();
  }
  
  showFloatingText(text, x, y, color) {
    // We can't easily animate on canvas without a loop, 
    // so we'll just draw it once and let the next render clear it.
    // For a better game we'd need a render loop.
    this.ctx.fillStyle = color;
    this.ctx.font = "bold 20px sans-serif";
    this.ctx.fillText(text, x + 15, y);
  }
  
  startTimer() {
    this.timer = setInterval(() => {
      this.timeRemaining--;
      this.timerDisplay.textContent = this.timeRemaining;
      if (this.timeRemaining <= 0) this.defeat();
    }, 1000);
  }
  
  stopTimer() {
    if (this.timer) clearInterval(this.timer);
  }
  
  updateEvolutionBar() {
    this.evolutionBar.style.width = this.evolution + "%";
    this.evolutionPercent.textContent = Math.round(this.evolution);
  }
  
  updateScoreDisplay() {
    this.scoreDisplay.textContent = this.currentScore;
  }
  
  victory() {
    this.gameActive = false;
    this.stopTimer();
    this.resultDiv.className = "boss-result victory";
    this.resultDiv.innerHTML = `<h3 class="accent">VICTORY!</h3><div class="final-score">${this.currentScore}</div>`;
    this.resultDiv.classList.remove("d-none");
  }
  
  defeat() {
    this.gameActive = false;
    this.stopTimer();
    this.resultDiv.className = "boss-result defeat";
    this.resultDiv.innerHTML = `<h3 style="color:var(--accent-2)">DEFEAT</h3><div class="final-score">${this.currentScore}</div>`;
    this.resultDiv.classList.remove("d-none");
  }
  
  reset() {
    this.stopTimer();
    this.gameActive = false;
    this.btnStart.disabled = false;
    this.resultDiv.classList.add("d-none");
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.targetDisplay.textContent = 'Click "Start Battle" to begin';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.bossBattle = new BossBattle();
});
