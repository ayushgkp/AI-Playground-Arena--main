class TargetTaggerGame {
    constructor() {
        this.canvas = document.getElementById('targetCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.scoreEl = document.getElementById('targetScore');
        this.missionEl = document.getElementById('targetMission');
        this.msgEl = document.getElementById('targetGameMsg');
        
        this.uploadInput = document.getElementById('targetUploadInput');
        this.btnUpload = document.getElementById('btnUploadTarget');
        this.btnStart = document.getElementById('btnStartTargetGame');
        
        this.sprites = []; // {image, x, y, vx, vy, width, height, label}
        this.score = 0;
        this.isPlaying = false;
        this.missionLabel = "";
        this.gameLoopId = null;
        this.initialized = false;
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    init() {
        if (!this.canvas) return;
        
        // Resize now that the tab is likely visible
        this.resizeCanvas();
        
        if (this.initialized) return;
        
        this.btnUpload.addEventListener('click', () => this.uploadInput.click());
        this.uploadInput.addEventListener('change', (e) => this.handleUpload(e));
        this.btnStart.addEventListener('click', () => this.startGame());
        
        this.canvas.addEventListener('mousedown', (e) => this.handleClick(e));
        
        this.initialized = true;
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        if (rect.width > 0) {
            this.canvas.width = rect.width;
            this.canvas.height = 400; // Fixed height
        }
    }

    async handleUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append("image", file);
        
        this.btnUpload.textContent = "Processing...";
        this.btnUpload.disabled = true;
        
        try {
            const resp = await fetch("/api/target_tagger/sprites", {
                method: "POST",
                body: formData
            });
            
            const data = await resp.json();
            
            if (data.success) {
                this.loadSprites(data.sprites);
                this.btnStart.disabled = false;
                alert(`Extracted ${data.count} objects! Ready to play.`);
            } else {
                alert("Error: " + data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Upload failed.");
        } finally {
            this.btnUpload.textContent = "Upload Source";
            this.btnUpload.disabled = false;
        }
    }

    loadSprites(spriteData) {
        // Ensure canvas has dimensions before calculating positions
        this.resizeCanvas();
        const w = this.canvas.width || 800; // Fallback if still 0
        const h = this.canvas.height || 400;

        this.sprites = spriteData.map(s => {
            const img = new Image();
            img.src = "data:image/png;base64," + s.image;
            return {
                imgObj: img,
                label: s.label,
                width: s.width,
                height: s.height,
                x: Math.random() * (w - s.width),
                y: Math.random() * (h - s.height),
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                active: true
            };
        });
    }

    startGame() {
        if (this.sprites.length === 0) return;
        
        this.resizeCanvas(); // Ensure size is correct before starting
        
        this.score = 0;
        this.updateScore();
        this.isPlaying = true;
        this.msgEl.classList.add('d-none');
        
        // Pick random mission
        this.setNewMission();
        
        if (this.gameLoopId) cancelAnimationFrame(this.gameLoopId);
        this.loop();
    }

    setNewMission() {
        const activeSprites = this.sprites.filter(s => s.active);
        if (activeSprites.length === 0) {
            this.endGame(true);
            return;
        }
        
        const target = activeSprites[Math.floor(Math.random() * activeSprites.length)];
        this.missionLabel = target.label;
        this.missionEl.textContent = `SHOOT: ${this.missionLabel.toUpperCase()}`;
        this.missionEl.className = "text-danger fw-bold";
    }

    endGame(win) {
        this.isPlaying = false;
        cancelAnimationFrame(this.gameLoopId);
        this.msgEl.textContent = win ? "MISSION COMPLETE!" : "GAME OVER";
        this.msgEl.classList.remove('d-none');
    }

    updateScore() {
        this.scoreEl.textContent = this.score;
    }

    loop() {
        if (!this.isPlaying) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update and draw sprites
        this.sprites.forEach(s => {
            if (!s.active) return;
            
            // Move
            s.x += s.vx;
            s.y += s.vy;
            
            // Bounce
            if (s.x <= 0 || s.x + s.width >= this.canvas.width) s.vx *= -1;
            if (s.y <= 0 || s.y + s.height >= this.canvas.height) s.vy *= -1;
            
            // Draw
            this.ctx.drawImage(s.imgObj, s.x, s.y);
            
            // Draw label (optional, maybe only on hover? or always for now)
            // this.ctx.fillStyle = "white";
            // this.ctx.fillText(s.label, s.x, s.y - 5);
        });
        
        this.gameLoopId = requestAnimationFrame(() => this.loop());
    }

    handleClick(e) {
        if (!this.isPlaying) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        // Check hits (reverse order to hit top sprites first)
        let hit = false;
        for (let i = this.sprites.length - 1; i >= 0; i--) {
            const s = this.sprites[i];
            if (!s.active) continue;
            
            if (mx >= s.x && mx <= s.x + s.width &&
                my >= s.y && my <= s.y + s.height) {
                
                // Hit!
                hit = true;
                if (s.label === this.missionLabel) {
                    // Correct target
                    this.score += 100;
                    s.active = false; // Remove it
                    
                    // Check if any of this label left
                    const remaining = this.sprites.filter(sp => sp.active && sp.label === this.missionLabel);
                    if (remaining.length === 0) {
                        this.setNewMission();
                    }
                } else {
                    // Wrong target
                    this.score -= 50;
                }
                this.updateScore();
                break; // Only hit one at a time
            }
        }
    }
}
