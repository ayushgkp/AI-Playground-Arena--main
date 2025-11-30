// Full website frontend logic (self-contained simulator + leaderboard persistence)
// Tab handling
const tabs = document.querySelectorAll("#modeTabs .nav-link");
const panels = {
	detect: document.getElementById("mode-detect"),
	sketch: document.getElementById("mode-sketch"),
	gan: document.getElementById("mode-gan"),
};

tabs.forEach((tab) => {
	tab.addEventListener("click", () => {
		tabs.forEach((t) => t.classList.remove("active"));
		tab.classList.add("active");

		const mode = tab.getAttribute("data-mode");
		for (const key in panels) {
			if (key === mode) panels[key].classList.remove("d-none");
			else panels[key].classList.add("d-none");
		}
	});
});

// --- Leaderboard persistence (localStorage) ---
const LB_KEY = 'ai_playground_leaderboard_v1';
function loadLeaderboard(){
	try{
		const raw = localStorage.getItem(LB_KEY);
		if(!raw) return [];
		return JSON.parse(raw);
	}catch(e){ return []; }
}
function saveLeaderboard(list){
	localStorage.setItem(LB_KEY, JSON.stringify(list));
}
function updateLeaderboardUI(){
	const list = loadLeaderboard();
	const ul = document.querySelector('.leaderboard-list');
	if(!ul) return;
	ul.innerHTML = '';
	list.slice(0,10).forEach(item => {
		const li = document.createElement('li');
		li.className = 'd-flex justify-content-between';
		li.innerHTML = `<span>${escapeHtml(item.name)}</span><strong class="accent">${item.score}</strong>`;
		ul.appendChild(li);
	});
}
function addScoreToLeaderboard(name, score){
	if(!name) name = 'Player';
	const list = loadLeaderboard();
	list.push({name, score});
	list.sort((a,b)=> b.score - a.score);
	saveLeaderboard(list);
	updateLeaderboardUI();
}
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.addEventListener('DOMContentLoaded', ()=>{
	updateLeaderboardUI();
});

// --- Utility functions ---
function blobToBase64(blob){
	return new Promise((resolve, reject)=>{
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result.split(',')[1]);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

// --- Simulator APIs (website-only) ---
// For static website we simulate backend responses with plausible data.
async function apiDetectObjects_simulator(file){
	// Basic reliable object detection
	const b64 = await blobToBase64(file);
	const img = new Image();
	img.src = 'data:image/png;base64,' + b64;
	
	return new Promise((resolve) => {
		img.onload = () => {
			const w = img.width;
			const h = img.height;
			
			// Create canvas and get image data
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			const imgData = ctx.getImageData(0, 0, w, h);
			const data = imgData.data;
			
			// Simple grid-based detection
			const bboxes = basicDetection(data, w, h);
			
			resolve({ bboxes, annotated_image: b64 });
		};
		if(img.complete && img.naturalWidth){ img.onload(); }
	});
}

function basicDetection(data, w, h){
	const cellSize = 15;
	const cells = [];
	
	// Create grid of cells
	for(let y = 0; y < h; y += cellSize){
		for(let x = 0; x < w; x += cellSize){
			const y2 = Math.min(y + cellSize, h);
			const x2 = Math.min(x + cellSize, w);
			
			const colors = [];
			for(let py = y; py < y2; py++){
				for(let px = x; px < x2; px++){
					const idx = (py * w + px) * 4;
					colors.push({
						r: data[idx],
						g: data[idx + 1],
						b: data[idx + 2]
					});
				}
			}
			
			if(colors.length > 0){
				// Calculate simple contrast/variance directly
				let rSum = 0, gSum = 0, bSum = 0;
				colors.forEach(c => {
					rSum += c.r;
					gSum += c.g;
					bSum += c.b;
				});
				
				const avgR = rSum / colors.length;
				const avgG = gSum / colors.length;
				const avgB = bSum / colors.length;
				
				let variance = 0;
				colors.forEach(c => {
					variance += Math.abs(c.r - avgR) + Math.abs(c.g - avgG) + Math.abs(c.b - avgB);
				});
				variance = variance / (colors.length * 3);
				
				// Score based on variance
				const score = Math.min(100, variance / 5);
				
				if(score > 2){ // Lower threshold
					const analyzed = analyzeColors(colors);
					cells.push({
						x, y, x2, y2,
						colors: analyzed || {
							hasCoolTones: false,
							hasWarmTones: false,
							hasGreenTones: false,
							hasNaturalTones: false,
							hasDarkTones: false,
							colorVariety: variance / 255
						},
						contrast: variance,
						score: score
					});
				}
			}
		}
	}
	
	if(cells.length === 0) return [];
	
	// Find high-scoring regions
	const threshold = 5;
	const activeCells = cells.filter(c => c.score > threshold);
	
	if(activeCells.length === 0){
		// If no cells pass threshold, use all cells
		activeCells.push(...cells);
	}
	
	// Group adjacent active cells using simple connected components
	const visited = new Set();
	const regions = [];
	
	activeCells.forEach((cell, idx) => {
		if(visited.has(idx)) return;
		
		const region = { cells: [] };
		const queue = [idx];
		
		while(queue.length > 0){
			const cIdx = queue.shift();
			if(visited.has(cIdx)) continue;
			visited.add(cIdx);
			
			const c = activeCells[cIdx];
			region.cells.push(c);
			
			// Find adjacent cells
			for(let i = 0; i < activeCells.length; i++){
				if(!visited.has(i)){
					const other = activeCells[i];
					const dx = Math.abs(c.x - other.x) + Math.abs(c.x2 - other.x2);
					const dy = Math.abs(c.y - other.y) + Math.abs(c.y2 - other.y2);
					
					// Adjacent if very close
					if((dx < cellSize && Math.abs(c.y - other.y) < cellSize * 2) ||
					   (dy < cellSize && Math.abs(c.x - other.x) < cellSize * 2)){
						queue.push(i);
					}
				}
			}
		}
		
		if(region.cells.length >= 1){
			regions.push(region);
		}
	});
	
	// Convert regions to bboxes
	const bboxes = [];
	
	regions.forEach(region => {
		let minX = w, maxX = 0, minY = h, maxY = 0;
		
		region.cells.forEach(cell => {
			minX = Math.min(minX, cell.x);
			maxX = Math.max(maxX, cell.x2);
			minY = Math.min(minY, cell.y);
			maxY = Math.max(maxY, cell.y2);
		});
		
		const width = maxX - minX;
		const height = maxY - minY;
		const area = width * height;
		const areaPercent = (area / (w * h)) * 100;
		
		// Filter by size - be permissive
		if(areaPercent > 0.2 && areaPercent < 85){
			// Get representative colors from region
			let hasCool = false, hasWarm = false, hasGreen = false;
			let hasNatural = false, hasDark = false;
			
			region.cells.forEach(cell => {
				if(cell.colors.hasCoolTones) hasCool = true;
				if(cell.colors.hasWarmTones) hasWarm = true;
				if(cell.colors.hasGreenTones) hasGreen = true;
				if(cell.colors.hasNaturalTones) hasNatural = true;
				if(cell.colors.hasDarkTones) hasDark = true;
			});
			
			// Simple classification
			let label = null;
			let confidence = 0.70;
			
			if(hasCool && !hasWarm && areaPercent > 12 && minY < h * 0.4){
				label = 'sky';
				confidence = 0.88;
			} else if(hasGreen && areaPercent > 5){
				label = 'tree';
				confidence = 0.85;
			} else if(hasNatural && !hasGreen && areaPercent < 8){
				label = 'branch';
				confidence = 0.80;
			} else if((hasWarm || hasDark) && !hasGreen && areaPercent > 0.3){
				if(areaPercent < 4){
					label = 'bird';
					confidence = 0.83;
				} else if(areaPercent < 15){
					label = 'dog';
					confidence = 0.82;
				} else {
					label = 'object';
					confidence = 0.68;
				}
			} else if(areaPercent > 0.2){
				label = 'object';
				confidence = 0.65;
			}
			
			if(label){
				bboxes.push({
					bbox: [Math.max(0, minX), Math.max(0, minY), 
					        Math.min(w, maxX), Math.min(h, maxY)],
					label: label,
					score: confidence
				});
			}
		}
	});
	
	// Return top 3 by score
	bboxes.sort((a, b) => b.score - a.score);
	return bboxes.slice(0, 3).length > 0 ? bboxes.slice(0, 3) : generateFallback(data, w, h);
}

function generateFallback(data, w, h){
	// Emergency fallback: divide image into regions
	const regions = [
		{ x: 0, y: 0, x2: w * 0.5, y2: h * 0.5 },
		{ x: w * 0.5, y: 0, x2: w, y2: h * 0.5 },
		{ x: 0, y: h * 0.5, x2: w * 0.5, y2: h },
		{ x: w * 0.5, y: h * 0.5, x2: w, y2: h }
	];
	
	const bboxes = [];
	regions.forEach(region => {
		const colors = [];
		for(let y = region.y; y < region.y2; y += 3){
			for(let x = region.x; x < region.x2; x += 3){
				const idx = (y * w + x) * 4;
				colors.push({ r: data[idx], g: data[idx+1], b: data[idx+2] });
			}
		}
		
		if(colors.length > 0){
			const analyzed = analyzeColors(colors);
			let label = 'region';
			let conf = 0.60;
			
			if(analyzed && analyzed.hasCoolTones) label = 'sky';
			else if(analyzed && analyzed.hasGreenTones) label = 'tree';
			else if(analyzed && (analyzed.hasWarmTones || analyzed.hasDarkTones)) label = 'object';
			
			if(conf > 0.5){
				bboxes.push({
					bbox: [Math.round(region.x), Math.round(region.y), 
					        Math.round(region.x2), Math.round(region.y2)],
					label, score: conf
				});
			}
		}
	});
	
	return bboxes;
}

function floodFillComponent(edges, startIdx, w, h, visited){
	const queue = [startIdx];
	const pixels = [];
	let minX = w, maxX = 0, minY = h, maxY = 0;
	
	while(queue.length > 0){
		const idx = queue.shift();
		if(visited[idx]) continue;
		visited[idx] = 1;
		pixels.push(idx);
		
		const y = Math.floor(idx / w);
		const x = idx % w;
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
		
		const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
		neighbors.forEach(nIdx => {
			if(nIdx >= 0 && nIdx < w * h && !visited[nIdx] && edges[nIdx] > 128){
				queue.push(nIdx);
			}
		});
	}
	
	return { pixels, minX, maxX, minY, maxY };
}

function extractRegionColors(data, comp, w){
	const colors = [];
	comp.pixels.slice(0, Math.min(comp.pixels.length, 500)).forEach(idx => {
		colors.push({
			r: data[idx * 4],
			g: data[idx * 4 + 1],
			b: data[idx * 4 + 2]
		});
	});
	return colors;
}

function classifyByColor(regionColors, comp, w, h){
	if(regionColors.length === 0) return null;
	
	const colors = analyzeColors(regionColors);
	const width = comp.maxX - comp.minX;
	const height = comp.maxY - comp.minY;
	const aspectRatio = width / (height || 1);
	const area = width * height;
	const totalArea = w * h;
	const areaPercent = (area / totalArea) * 100;
	
	// Bird: small, colorful, concentrated
	if(width < w * 0.3 && height < h * 0.4 && areaPercent < 10 && 
	   (colors.hasDarkTones || colors.hasWarmTones) && colors.colorVariety > 0.2){
		return { name: 'bird', confidence: 0.87 };
	}
	
	// Sky: very large, uniform, cool tones
	if(areaPercent > 15 && colors.hasCoolTones && colors.colorVariety < 0.15){
		return { name: 'sky', confidence: 0.90 };
	}
	
	// Tree/Branch: vertical, green/brown, medium to large
	if(aspectRatio < 0.7 && (colors.hasGreenTones || colors.hasNaturalTones)){
		return { name: colors.hasGreenTones ? 'tree' : 'branch', confidence: 0.85 };
	}
	
	// Person: tall, centered, varied colors
	if(aspectRatio < 0.65 && comp.minX > w * 0.1 && comp.maxX < w * 0.9 &&
	   (colors.hasSkinTones || colors.colorVariety > 0.35)){
		return { name: 'person', confidence: 0.82 };
	}
	
	// Dog/Animal: compact, warm/dark
	if(width > w * 0.05 && width < w * 0.4 && colors.hasWarmTones){
		return { name: 'dog', confidence: 0.80 };
	}
	
	// Flower: very colorful
	if(colors.colorVariety > 0.55){
		return { name: 'flower', confidence: 0.78 };
	}
	
	// Generic object
	if(colors.colorVariety > 0.3){
		return { name: 'object', confidence: 0.65 };
	}
	
	return null;
}

function classifyRegion(region, data, w, h){
	// Extract pixel colors from region
	const regionPixels = [];
	region.pixels.forEach(idx => {
		regionPixels.push({
			r: data[idx * 4],
			g: data[idx * 4 + 1],
			b: data[idx * 4 + 2]
		});
	});
	
	if(regionPixels.length === 0) return null;
	
	// Analyze region
	const colors = analyzeColors(regionPixels);
	const width = region.maxX - region.minX;
	const height = region.maxY - region.minY;
	const aspectRatio = width / (height || 1);
	const area = width * height;
	const areaPercent = (area / (w * h)) * 100;
	
	// Sky detection: FIRST - Large area, uniform cool tones, very low color variety
	if(areaPercent > 8 && colors.hasCoolTones && colors.colorVariety < 0.15){
		return { name: 'sky', confidence: 0.89 };
	}
	
	// Tree/Branch detection: Green or brown/natural tones, moderate to large area
	if((colors.hasGreenTones || colors.hasNaturalTones) && areaPercent > 1.5){
		// Branches are brown/tan colored
		if(colors.hasNaturalTones && !colors.hasCoolTones){
			return { name: 'branch', confidence: 0.84 };
		}
		// Green foliage
		if(colors.hasGreenTones){
			return { name: 'tree', confidence: 0.86 };
		}
	}
	
	// Bird detection: Small, concentrated dark object with warm/colorful accents, NOT in background
	if(region.minY < h * 0.6 && width < w * 0.25 && width > w * 0.03 && 
	   !colors.hasCoolTones && areaPercent < 8 && areaPercent > 0.5 &&
	   (colors.hasDarkTones || (colors.hasWarmTones && colors.colorVariety > 0.3))){
		return { name: 'bird', confidence: 0.87 };
	}
	
	// Person/Human detection: Tall, centered, varied tones
	if(aspectRatio < 0.7 && region.minX > w * 0.15 && region.maxX < w * 0.85 &&
	   areaPercent > 1.5 && (colors.hasSkinTones || colors.colorVariety > 0.3)){
		return { name: 'person', confidence: 0.80 };
	}
	
	// Dog/Animal detection: Medium, warm/dark but not as large as trees
	if(width > w * 0.05 && width < w * 0.3 && 
	   colors.hasWarmTones && colors.hasDarkTones && areaPercent > 0.8 && areaPercent < 8){
		return { name: 'dog', confidence: 0.78 };
	}
	
	// Flower detection: Very colorful, small to medium
	if(colors.colorVariety > 0.5 && areaPercent > 0.3 && areaPercent < 5){
		return { name: 'flower', confidence: 0.76 };
	}
	
	// Generic object
	if(colors.colorVariety > 0.25 && areaPercent > 0.3){
		return { name: 'object', confidence: 0.62 };
	}
	
	return null;
}

function extractRegionData(region, data, w){
	const regionPixels = [];
	region.pixels.forEach(idx => {
		const pixelIdx = idx * 4;
		regionPixels.push({
			r: data[pixelIdx],
			g: data[pixelIdx + 1],
			b: data[pixelIdx + 2]
		});
	});
	return regionPixels;
}

function analyzeColors(regionPixels){
	let warmTones = 0, coolTones = 0, darkTones = 0, skinTones = 0, greenTones = 0, naturalTones = 0;
	let rSum = 0, gSum = 0, bSum = 0;
	
	regionPixels.forEach(p => {
		rSum += p.r; gSum += p.g; bSum += p.b;
		
		// Warm tones: high R, medium G/B
		if(p.r > p.b + 20 && p.r > 80) warmTones++;
		// Cool tones: high B, low R
		if(p.b > p.r + 20 && p.b > 80) coolTones++;
		// Dark tones
		if(p.r + p.g + p.b < 150) darkTones++;
		// Skin tones: R > G > B, specific range
		if(p.r > p.g && p.g > p.b && p.r > 95 && p.g > 40 && p.b > 20 && Math.abs(p.r - p.g) < 15) skinTones++;
		// Green tones: G > R and G > B, medium to high brightness
		if(p.g > p.r + 15 && p.g > p.b + 15 && p.g > 60) greenTones++;
		// Natural/Earth tones: brown/tan - R+G > B, moderate saturation
		if(p.r > 80 && p.g > 60 && p.b < 80 && Math.abs(p.r - p.g) < 40) naturalTones++;
	});
	
	const count = regionPixels.length;
	const avgR = rSum / count;
	const avgG = gSum / count;
	const avgB = bSum / count;
	const colorVariety = (Math.abs(avgR - avgG) + Math.abs(avgG - avgB)) / 255;
	
	return {
		hasWarmTones: warmTones > count * 0.15,
		hasCoolTones: coolTones > count * 0.15,
		hasDarkTones: darkTones > count * 0.3,
		hasSkinTones: skinTones > count * 0.1,
		hasGreenTones: greenTones > count * 0.2,
		hasNaturalTones: naturalTones > count * 0.15,
		colorVariety: colorVariety
	};
}

function analyzeShape(region){
	const width = region.maxX - region.minX;
	const height = region.maxY - region.minY;
	const area = region.area;
	const boundingArea = width * height;
	const compactness = area / boundingArea; // Higher = more compact
	
	return { compactness, aspectRatio: width / height };
}

async function apiObjectEdit_simulator(payload){
	// echo back the image; frontend will draw 'removed' overlays locally
	return { edited_image: payload.image };
}

async function apiSketchToImage_simulator(file, style='cartoon'){
	// Improved sketch-to-image simulator:
	// - Uses sketch (black strokes on white) as mask over a colorful base
	// - Applies style-specific post-filters (posterize, brightness, desaturation, hue/contrast)
	const b64 = await blobToBase64(file);
	const img = new Image();
	img.src = 'data:image/png;base64,' + b64;

	return new Promise((resolve) => {
		img.onload = () => {
			const w = img.width || 400;
			const h = img.height || 300;
			const canvas = document.createElement('canvas');
			canvas.width = w; canvas.height = h;
			const ctx = canvas.getContext('2d');

      // 1) draw a VIBRANT colorful background depending on style
      const bg = ctx.createLinearGradient(0,0,w,h);
      if(style === 'anime'){
        // Deep pink to bright cyan - high saturation neon
        bg.addColorStop(0, '#ff1493'); bg.addColorStop(1, '#00bfff');
      } else if(style === 'realistic'){
        // High-contrast grays for photorealistic feel
        bg.addColorStop(0, '#a8a8a8'); bg.addColorStop(1, '#f0f0f0');
      } else if(style === 'stylized'){
        // Vibrant warm-to-cool: bright orange to bright cyan
        bg.addColorStop(0, '#ff6600'); bg.addColorStop(1, '#00ccff');
      } else { // cartoon / default
        // Bright primary colors: vivid yellow to vivid green
        bg.addColorStop(0, '#ffeb3b'); bg.addColorStop(1, '#76ff03');
      }
      ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);			// 2) draw the sketch on a temp canvas to extract mask
			const temp = document.createElement('canvas'); temp.width = w; temp.height = h;
			const tctx = temp.getContext('2d');
			tctx.drawImage(img, 0, 0, w, h);
			const id = tctx.getImageData(0,0,w,h);
			const data = id.data;

			// 3) create an overlay where strokes darken or colorize the background
			const overlay = tctx.createImageData(w,h);
			const od = overlay.data;
			for(let i=0;i<data.length;i+=4){
				const r = data[i], g = data[i+1], b = data[i+2];
				// detect non-white (stroke) pixels
				const isStroke = (r<220 || g<220 || b<220);
				if(isStroke){
					// stroke - set VIBRANT colors depending on style
					if(style === 'cartoon'){
						od[i] = 0; od[i+1] = 0; od[i+2] = 0; od[i+3] = 255; // pure black lines
					} else if(style === 'anime'){
						od[i] = 20; od[i+1] = 20; od[i+2] = 80; od[i+3] = 220; // deep blue
					} else if(style === 'realistic'){
						od[i] = 50; od[i+1] = 50; od[i+2] = 50; od[i+3] = 240; // darker gray
					} else { // stylized
						od[i] = 10; od[i+1] = 100; od[i+2] = 200; od[i+3] = 240; // bright blue
					}
				} else {
					// background pixel - make transparent in overlay
					od[i]=data[i]; od[i+1]=data[i+1]; od[i+2]=data[i+2]; od[i+3]=0;
				}
			}

			// apply overlay using multiply/composite to darken lines over bg
			tctx.putImageData(overlay,0,0);
			ctx.globalCompositeOperation = 'multiply';
			ctx.drawImage(temp,0,0);
			ctx.globalCompositeOperation = 'source-over';

			// 4) post-processing: get final pixels and apply filters
			const final = ctx.getImageData(0,0,w,h);
			const fd = final.data;

      if(style === 'cartoon'){
        // posterize: reduce color depth + boost saturation
        for(let i=0;i<fd.length;i+=4){
          fd[i] = Math.floor(fd[i]/32)*32;
          fd[i+1] = Math.floor(fd[i+1]/32)*32;
          fd[i+2] = Math.floor(fd[i+2]/32)*32;
        }
      } else if(style === 'anime'){
        // strong brightness boost + saturation enhancement
        for(let i=0;i<fd.length;i+=4){
          fd[i] = Math.min(255, fd[i]*1.25);
          fd[i+1] = Math.min(255, fd[i+1]*1.25);
          fd[i+2] = Math.min(255, fd[i+2]*1.25);
        }
      } else if(style === 'realistic'){
        // slight desaturate, preserve tone
        for(let i=0;i<fd.length;i+=4){
          const r=fd[i], g=fd[i+1], b=fd[i+2];
          const gray = (r*0.3 + g*0.59 + b*0.11);
          fd[i] = Math.floor(r*0.88 + gray*0.12);
          fd[i+1] = Math.floor(g*0.88 + gray*0.12);
          fd[i+2] = Math.floor(b*0.88 + gray*0.12);
        }
      } else if(style === 'stylized'){
        // strong color shift + high contrast
        for(let i=0;i<fd.length;i+=4){
          let r = fd[i], g = fd[i+1], b = fd[i+2];
          // vibrant hue rotation
          const nr = Math.min(255, g*1.15);
          const ng = Math.min(255, b*1.10);
          const nb = Math.min(255, r*0.85 + 20);
          // strong contrast
          const factor = 1.3;
          fd[i] = Math.min(255, Math.max(0, (nr-128)*factor + 128));
          fd[i+1] = Math.min(255, Math.max(0, (ng-128)*factor + 128));
          fd[i+2] = Math.min(255, Math.max(0, (nb-128)*factor + 128));
        }
      }			ctx.putImageData(final,0,0);

			// small optional blur for 'anime' to smooth lines
			if(style === 'anime'){
				// cheap blur: scale down & up
				const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
				const tctx2 = tmp.getContext('2d');
				tctx2.drawImage(canvas, 0, 0, w*0.5, h*0.5);
				ctx.clearRect(0,0,w,h);
				ctx.drawImage(tmp, 0, 0, w, h);
			}

			const outB64 = canvas.toDataURL('image/png').split(',')[1];
			resolve({ generated_image: outB64 });
		};
		// in case image already loaded
		if(img.complete && img.naturalWidth){ img.onload(); }
	});
}

async function apiGanGenerate_simulator(payload){
	const canvas = document.createElement('canvas');
	canvas.width = 256; canvas.height = 256;
	const ctx = canvas.getContext('2d');
	// gradient + noise
	const g = ctx.createLinearGradient(0,0,256,256);
	g.addColorStop(0, '#00e5a8'); g.addColorStop(1, '#ff4dff');
	ctx.fillStyle = g; ctx.fillRect(0,0,256,256);
	const imgd = ctx.getImageData(0,0,256,256);
	for(let i=0;i<imgd.data.length;i+=4){
		const v = (Math.random()-0.5) * 40 * (payload.noise_scale||1);
		imgd.data[i] = Math.min(255, Math.max(0, imgd.data[i]+v));
		imgd.data[i+1] = Math.min(255, Math.max(0, imgd.data[i+1]+v));
		imgd.data[i+2] = Math.min(255, Math.max(0, imgd.data[i+2]+v));
	}
	ctx.putImageData(imgd,0,0);
	return { generated_image: canvas.toDataURL('image/png').split(',')[1] };
}

// ========== 1) OBJECT REMOVAL ARENA ==========
let originalImageData = null; // base64
let detectedBboxes = [];      // from simulator

const detectInput = document.getElementById("detectImageInput");
const btnRunDetection = document.getElementById("btnRunDetection");
const detectCanvas = document.getElementById("detectCanvas");
const bboxListDiv = document.getElementById("bboxList");
const btnApplyEdits = document.getElementById("btnApplyEdits");
const editedImage = document.getElementById("editedImage");

let detectCtx = detectCanvas.getContext("2d");

btnRunDetection.addEventListener("click", async () => {
	const file = detectInput.files[0] || null;
	if (!file) {
		// if no file, use sample image
		const resp = await fetch('static/images/sample_parking.svg');
		const blob = await resp.blob();
		// emulate file
		const sim = await apiDetectObjects_simulator(blob);
		detectedBboxes = sim.bboxes;
		originalImageData = sim.annotated_image;
		drawBase64OnCanvas(detectCanvas, detectCtx, originalImageData);
		renderBboxList();
		return;
	}

	const sim = await apiDetectObjects_simulator(file);
	detectedBboxes = sim.bboxes;
	originalImageData = sim.annotated_image;
	drawBase64OnCanvas(detectCanvas, detectCtx, originalImageData);
	renderBboxList();
});

function renderBboxList() {
	bboxListDiv.innerHTML = "";
	const bboxCount = document.getElementById("bboxCount");
	if(bboxCount) bboxCount.textContent = detectedBboxes.length;
	
	detectedBboxes.forEach((bbox, idx) => {
		const div = document.createElement("div");
		div.className = "bbox-item";
		const selectId = `action-${idx}`;
		const labelText = bbox.label.charAt(0).toUpperCase() + bbox.label.slice(1);
		div.innerHTML = `
			<div style="flex:1;">
				<strong>#${idx+1}</strong> <span class="accent">${escapeHtml(labelText)}</span>
				<span class="muted small">(${(bbox.score*100).toFixed(0)}% confidence)</span>
			</div>
			<div>
				<select class="form-select form-select-sm bbox-action" id="${selectId}" data-index="${idx}" style="width:110px;" title="Choose action for this ${labelText.toLowerCase()}">
					<option value="keep" selected>✓ Keep</option>
					<option value="remove">✕ Remove</option>
					<option value="blur">◯ Blur</option>
					<option value="enhance">⚡ Enhance</option>
				</select>
			</div>
		`;
		bboxListDiv.appendChild(div);
	});
	// draw boxes overlay
	drawBoxesOverlay();
}

function drawBase64OnCanvas(canvas, ctx, b64) {
	const img = new Image();
	img.onload = function () {
		canvas.width = img.width;
		canvas.height = img.height;
		ctx.clearRect(0,0,canvas.width,canvas.height);
		ctx.drawImage(img, 0, 0);
		drawBoxesOverlay();
	};
	img.src = "data:image/png;base64," + b64;
}

function drawBoxesOverlay(){
	if(!detectedBboxes || detectedBboxes.length===0) return;
	// overlay on canvas
	const ctx = detectCtx;
	ctx.save();
	ctx.lineWidth = 3;
	detectedBboxes.forEach((b, idx)=>{
		const [x1,y1,x2,y2] = b.bbox;
		ctx.strokeStyle = 'rgba(255,77,255,0.95)';
		ctx.fillStyle = 'rgba(0,229,168,0.12)';
		ctx.strokeRect(x1,y1,x2-x1,y2-y1);
		ctx.fillRect(x1,y1, (x2-x1), (y2-y1));
		ctx.fillStyle = '#fff';
		ctx.font = '12px Inter, sans-serif';
		ctx.fillText(`${b.label} ${Math.round(b.score*100)}%`, x1+6, y1+14);
	});
	ctx.restore();
}

btnApplyEdits.addEventListener("click", async () => {
	if (!originalImageData || detectedBboxes.length === 0) {
		alert("No detections yet. Run detection first.");
		return;
	}

	const actions = [];
	const selects = document.querySelectorAll(".bbox-action");
	let hasRemovals = false;
	selects.forEach((sel) => {
		const idx = parseInt(sel.getAttribute("data-index"));
		const val = sel.value;
		actions.push({ bbox: detectedBboxes[idx].bbox, action: val });
		if(val !== 'keep') hasRemovals = true;
	});

	if(!hasRemovals){
		alert("Select at least one object to modify (Remove, Blur, or Enhance)");
		return;
	}

	// Apply client-side visual effect on the edited preview
	applyLocalRemovalEffect(originalImageData, actions);

	// scoring: +20 for each remove, +10 for each blur
	const removed = actions.filter(a=>a.action==='remove').length;
	const blurred = actions.filter(a=>a.action==='blur').length;
	const score = (removed * 20) + (blurred * 10);
	if(score>0){
		const name = prompt(`You scored ${score} points! Enter your name to save to leaderboard:`, 'Player');
		if(name) addScoreToLeaderboard(name, score);
	}
});

function applyLocalRemovalEffect(b64img, actions){
	// draw on a temporary canvas, simulate remove/blur/enhance effects
	const img = new Image();
	img.onload = function(){
		const c = document.createElement('canvas'); 
		c.width = img.width; 
		c.height = img.height;
		const ctx = c.getContext('2d');
		ctx.drawImage(img, 0, 0);
		
		// Apply each action
		actions.forEach(a => {
			const [x1, y1, x2, y2] = a.bbox.map(v => Math.round(v));
			const w = Math.max(1, x2 - x1);
			const h = Math.max(1, y2 - y1);
			
			if(a.action === 'remove'){
				// Black out the area
				ctx.fillStyle = 'rgba(20, 20, 25, 0.98)';
				ctx.fillRect(x1, y1, w, h);
				// Add a subtle border
				ctx.strokeStyle = 'rgba(0, 229, 168, 0.3)';
				ctx.lineWidth = 2;
				ctx.strokeRect(x1, y1, w, h);
			} else if(a.action === 'blur'){
				// Blur the area using pixel manipulation
				// Get image data for the region
				const imgData = ctx.getImageData(x1, y1, w, h);
				const data = imgData.data;
				
				// Simple blur: average neighboring pixels
				for(let i = 0; i < data.length; i += 4){
					const r = data[i], g = data[i+1], b = data[i+2];
					const avg = Math.floor((r + g + b) / 3);
					data[i] = avg; data[i+1] = avg; data[i+2] = avg;
				}
				ctx.putImageData(imgData, x1, y1);
				
				// Add blur filter effect
				ctx.globalAlpha = 0.5;
				ctx.fillStyle = 'rgba(100, 100, 120, 0.4)';
				ctx.fillRect(x1, y1, w, h);
				ctx.globalAlpha = 1.0;
				
				// Blue border to indicate blur
				ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
				ctx.lineWidth = 3;
				ctx.strokeRect(x1, y1, w, h);
			} else if(a.action === 'enhance'){
				// Enhance: brighten and increase saturation
				const imgData = ctx.getImageData(x1, y1, w, h);
				const data = imgData.data;
				
				for(let i = 0; i < data.length; i += 4){
					let r = data[i], g = data[i+1], b = data[i+2];
					
					// Increase brightness by 25%
					r = Math.min(255, r * 1.25);
					g = Math.min(255, g * 1.25);
					b = Math.min(255, b * 1.25);
					
					// Increase saturation: boost color channels away from gray
					const avg = (r + g + b) / 3;
					const saturationFactor = 1.4;
					r = Math.min(255, Math.max(0, avg + (r - avg) * saturationFactor));
					g = Math.min(255, Math.max(0, avg + (g - avg) * saturationFactor));
					b = Math.min(255, Math.max(0, avg + (b - avg) * saturationFactor));
					
					data[i] = r;
					data[i+1] = g;
					data[i+2] = b;
				}
				ctx.putImageData(imgData, x1, y1);
				
				// Add enhancement glow effect
				ctx.globalAlpha = 0.3;
				ctx.fillStyle = 'rgba(255, 200, 0, 0.5)';
				ctx.fillRect(x1, y1, w, h);
				ctx.globalAlpha = 1.0;
				
				// Golden/yellow border to indicate enhancement
				ctx.shadowColor = 'rgba(255, 200, 0, 0.7)';
				ctx.shadowBlur = 8;
				ctx.strokeStyle = 'rgba(255, 220, 0, 0.8)';
				ctx.lineWidth = 3;
				ctx.strokeRect(x1, y1, w, h);
				ctx.shadowBlur = 0;
			}
		});
		
		// Show the edited image
		editedImage.src = c.toDataURL('image/png');
		editedImage.style.display = 'block';
		const noMsg = document.getElementById('noEditMessage');
		if(noMsg) noMsg.style.display = 'none';
		
		// Add animation
		editedImage.classList.add('pop');
		setTimeout(() => editedImage.classList.remove('pop'), 600);
	};
	img.src = 'data:image/png;base64,' + b64img;
}

// ========== 2) SKETCH TO IMAGE ==========
const sketchCanvas = document.getElementById("sketchCanvas");
const sketchCtx = sketchCanvas.getContext("2d");
sketchCanvas.width = 400; sketchCanvas.height = 300;
sketchCtx.fillStyle = "#ffffff"; sketchCtx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
let drawing = false;
sketchCanvas.addEventListener("mousedown", () => drawing = true);
sketchCanvas.addEventListener("mouseup", () => drawing = false);
sketchCanvas.addEventListener("mouseleave", () => drawing = false);
sketchCanvas.addEventListener("mousemove", drawSketch);
function drawSketch(e) { if (!drawing) return; const rect = sketchCanvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; sketchCtx.fillStyle = "#000000"; sketchCtx.beginPath(); sketchCtx.arc(x, y, 3, 0, Math.PI * 2); sketchCtx.fill(); }
const btnClearSketch = document.getElementById("btnClearSketch");
const btnGenerateFromSketch = document.getElementById("btnGenerateFromSketch");
const sketchOutput = document.getElementById("sketchOutput");
const guidanceScaleInput = document.getElementById("guidanceScale");
const numStepsInput = document.getElementById("numSteps");

// Track current sketch style
let currentSketchStyle = 'cartoon';

// Style button handlers
const styleButtons = document.querySelectorAll('.sketch-style-btn');
styleButtons.forEach(btn => {
	btn.addEventListener('click', () => {
		styleButtons.forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		currentSketchStyle = btn.getAttribute('data-style');
	});
});

// Range slider value display handlers
const guidanceValueSpan = document.getElementById('guidanceValue');
const stepsValueSpan = document.getElementById('stepsValue');
guidanceScaleInput.addEventListener('input', (e) => {
	guidanceValueSpan.textContent = parseFloat(e.target.value).toFixed(1);
});
numStepsInput.addEventListener('input', (e) => {
	stepsValueSpan.textContent = e.target.value;
});

btnClearSketch.addEventListener("click", () => { sketchCtx.fillStyle = "#ffffff"; sketchCtx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height); });
btnGenerateFromSketch.addEventListener("click", async () => {
	const blob = await new Promise((resolve) => sketchCanvas.toBlob(resolve, "image/png"));
	const sim = await apiSketchToImage_simulator(blob, currentSketchStyle);
	sketchOutput.src = "data:image/png;base64," + sim.generated_image;
	// small animation
	sketchOutput.classList.add('glow'); setTimeout(()=> sketchOutput.classList.remove('glow'), 900);
});

// ========== 3) GAN PLAYGROUND ==========
const latentDimInput = document.getElementById("latentDim");
const noiseScaleInput = document.getElementById("noiseScale");
const btnGanGenerate = document.getElementById("btnGanGenerate");
const ganOutput = document.getElementById("ganOutput");
btnGanGenerate.addEventListener("click", async () => {
	const payload = { latent_dim: parseInt(latentDimInput.value), noise_scale: parseFloat(noiseScaleInput.value) };
	const sim = await apiGanGenerate_simulator(payload);
	ganOutput.src = "data:image/png;base64," + sim.generated_image;
	ganOutput.classList.add('pop'); setTimeout(()=> ganOutput.classList.remove('pop'), 600);
});

// Save score button in leaderboard
const leaderboardPanel = document.querySelector('.leaderboard');
if(leaderboardPanel){
	const btn = document.createElement('button');
	btn.className = 'btn btn-outline-light btn-sm mt-2';
	btn.textContent = 'Reset Leaderboard';
	btn.addEventListener('click', ()=>{ if(confirm('Clear leaderboard?')){ localStorage.removeItem(LB_KEY); updateLeaderboardUI(); } });
	leaderboardPanel.appendChild(btn);
}

// small helper to auto-fill sample image on load
document.addEventListener('DOMContentLoaded', ()=>{
  // draw sample image to detectCanvas initially
  fetch('static/images/sample_parking.svg').then(r=>r.blob()).then(async blob=>{
    const b64 = await blobToBase64(blob);
    originalImageData = b64; detectedBboxes = [];
    drawBase64OnCanvas(detectCanvas, detectCtx, originalImageData);
  }).catch(()=>{});

  // wire hero CTA
  const cta = document.getElementById('btnStartDemo');
  if(cta){
    cta.addEventListener('click', ()=>{
      const tab = document.querySelector('#modeTabs .nav-link[data-mode="detect"]');
      if(tab) tab.click();
      const panel = document.getElementById('mode-detect');
      if(panel) panel.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }
});