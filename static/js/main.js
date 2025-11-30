// ---------- Tab handling ----------
const tabs = document.querySelectorAll("#modeTabs .nav-link");
const panels = {
  detect: document.getElementById("mode-detect"),
  sketch: document.getElementById("mode-sketch"),
  boss: document.getElementById("mode-boss"),
  noise: document.getElementById("mode-noise"),
  target: document.getElementById("mode-target"),
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

    if (mode === 'boss') {
      bossBattle.init();
    } else if (mode === 'noise') {
      shadowInverter.init();
    } else if (mode === 'target') {
      targetTagger.init();
    }
  });
});

// ========== 0) Backend detection / simulator ==========
let USE_BACKEND = true;

// We are serving from Flask, so backend is always available.
// Removed faulty checkBackend() which looked for /api/slots

// helper: read a File/Blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// wrapper APIs that use backend if available, otherwise simulate locally
async function apiDetectObjects(formData) {
  if (USE_BACKEND) {
    const resp = await fetch("/api/detect_objects", {
      method: "POST",
      body: formData,
    });
    return resp;
  }
  // simulator: return no bboxes and annotated image = uploaded image
  const file = formData.get("image");
  const b64 = await blobToBase64(file);
  return { ok: true, json: async () => ({ bboxes: [], annotated_image: b64 }) };
}

async function apiObjectEdit(payload) {
  if (USE_BACKEND) {
    const resp = await fetch("/api/object_edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return resp;
  }
  // simulator: simply return the original image
  return { ok: true, json: async () => ({ edited_image: payload.image }) };
}

async function apiSketchToImage(formData) {
  if (USE_BACKEND) {
    const resp = await fetch("/api/sketch_to_image", {
      method: "POST",
      body: formData,
    });
    return resp;
  }
  // simulator: use the sketch as output
  const file = formData.get("image");
  const b64 = await blobToBase64(file);
  return { ok: true, json: async () => ({ generated_image: b64 }) };
}

async function apiGanGenerate(payload) {
  if (USE_BACKEND) {
    const resp = await fetch("/api/gan_generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return resp;
  }
  // simulator: generate a procedural canvas image
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const imgd = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < imgd.data.length; i += 4) {
    imgd.data[i] = Math.floor(Math.random() * 255);
    imgd.data[i + 1] = Math.floor(Math.random() * 255);
    imgd.data[i + 2] = Math.floor(Math.random() * 255);
    imgd.data[i + 3] = 255;
  }
  ctx.putImageData(imgd, 0, 0);
  const dataurl = canvas.toDataURL("image/png").split(",")[1];
  return { ok: true, json: async () => ({ generated_image: dataurl }) };
}

// check backend availability on load
// checkBackend(); // removed

// ========== 1) OBJECT REMOVAL ARENA ==========
let originalImageData = null; // base64
let detectedBboxes = []; // from backend

const detectInput = document.getElementById("detectImageInput");
const btnRunDetection = document.getElementById("btnRunDetection");
const detectCanvas = document.getElementById("detectCanvas");
const bboxListDiv = document.getElementById("bboxList");
const btnApplyEdits = document.getElementById("btnApplyEdits");
const editedImage = document.getElementById("editedImage");

let detectCtx = detectCanvas.getContext("2d");

btnRunDetection.addEventListener("click", async () => {
  const file = detectInput.files[0];
  if (!file) {
    alert("Please choose an image first.");
    return;
  }

  const formData = new FormData();
  formData.append("image", file);
  const resp = await apiDetectObjects(formData);
  if (!resp.ok) {
    alert("Detection failed");
    return;
  }
  const data = await resp.json();
  detectedBboxes = data.bboxes;

  // Show CLEAN image (no boxes)
  originalImageData = data.annotated_image;
  drawBase64OnCanvas(detectCanvas, detectCtx, originalImageData);
  
  // Draw boxes on the canvas
  drawDetectionBoxes();

  // Show bbox list with checkboxes/action dropdowns
  renderBboxList();
});

function drawDetectionBoxes() {
  // Redraw the image first
  const img = new Image();
  img.onload = function() {
    detectCtx.drawImage(img, 0, 0);
    
    // Now draw boxes for all detections
    detectedBboxes.forEach((bbox, idx) => {
      const [x1, y1, x2, y2] = bbox.bbox;
      
      // Draw red box
      detectCtx.strokeStyle = "red";
      detectCtx.lineWidth = 3;
      detectCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      
      // Draw label
      const text = `#${idx + 1} ${bbox.label} ${bbox.score.toFixed(2)}`;
      detectCtx.fillStyle = "yellow";
      detectCtx.font = "16px Arial";
      detectCtx.fillText(text, x1 + 3, y1 +17);
    });
  };
  img.src = "data:image/png;base64," + originalImageData;
}

function renderBboxList() {
  bboxListDiv.innerHTML = "";
  detectedBboxes.forEach((bbox, idx) => {
    const div = document.createElement("div");
    div.className = "bbox-item";
    div.innerHTML = `
      <div style="flex: 1;">
        <div><span>#${idx + 1} ${bbox.label} (${bbox.score})</span></div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 0.75rem;">
          <label class="muted" style="margin: 0;">Scale:</label>
          <input type="range" min="0.5" max="2.0" step="0.1" value="1.0" 
                 class="form-range bbox-scale" data-index="${idx}" 
                 style="width: 80px; height: 4px;">
          <span class="bbox-scale-value" style="min-width: 35px;">1.0x</span>
        </div>
      </div>
      <select class="form-select form-select-sm bbox-action" data-index="${idx}" style="width: 100px;">
        <option value="keep">Keep</option>
        <option value="remove">Remove</option>
        <option value="scale">Scale</option>
      </select>
    `;
    bboxListDiv.appendChild(div);
    
    // Add event listener for scale slider
    const slider = div.querySelector(".bbox-scale");
    const valueDisplay = div.querySelector(".bbox-scale-value");
    slider.addEventListener("input", (e) => {
      valueDisplay.textContent = e.target.value + "x";
    });
  });
}

// Remove All button - sets all detected objects to "remove"
const btnRemoveAll = document.getElementById("btnRemoveAll");
if (btnRemoveAll) {
  btnRemoveAll.addEventListener("click", () => {
    if (detectedBboxes.length === 0) {
      alert("No objects detected yet.");
      return;
    }
    const selects = document.querySelectorAll(".bbox-action");
    selects.forEach((sel) => {
      sel.value = "remove";
    });
  });
}

function drawBase64OnCanvas(canvas, ctx, b64) {
  const img = new Image();
  img.onload = function () {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
  };
  img.src = "data:image/png;base64," + b64;
}

btnApplyEdits.addEventListener("click", async () => {
  if (!originalImageData || detectedBboxes.length === 0) {
    alert("No detections yet.");
    return;
  }

  const actions = [];
  const selects = document.querySelectorAll(".bbox-action");
  const sliders = document.querySelectorAll(".bbox-scale");
  
  selects.forEach((sel) => {
    const idx = parseInt(sel.getAttribute("data-index"));
    const val = sel.value;
    const scaleValue = parseFloat(sliders[idx].value);
    
    actions.push({
      bbox: detectedBboxes[idx].bbox,
      action: val,
      scale: scaleValue
    });
  });

  const payload = {
    image: originalImageData,
    actions: actions
  };

  const resp = await apiObjectEdit(payload);
  if (!resp.ok) {
    alert("Edit failed");
    return;
  }
  const data = await resp.json();
  editedImage.src = "data:image/png;base64," + data.edited_image;
});

// ========== 2) SKETCH TO IMAGE ==========

const sketchCanvas = document.getElementById("sketchCanvas");
console.log("Sketch canvas element:", sketchCanvas);

let sketchCtx = null;
let drawing = false;

if (!sketchCanvas) {
  console.error("ERROR: sketchCanvas not found!");
} else {
  sketchCtx = sketchCanvas.getContext("2d");
  sketchCanvas.width = 400;
  sketchCanvas.height = 300;
  sketchCtx.fillStyle = "#ffffff";
  sketchCtx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
  console.log("Sketch canvas initialized:", sketchCanvas.width, "x", sketchCanvas.height);

  sketchCanvas.addEventListener("mousedown", () => {
    drawing = true;
    console.log("Drawing started");
  });
  sketchCanvas.addEventListener("mouseup", () => {
    drawing = false;
    console.log("Drawing stopped");
  });
  sketchCanvas.addEventListener("mouseleave", () => (drawing = false));
  sketchCanvas.addEventListener("mousemove", drawSketch);
}

function drawSketch(e) {
  if (!drawing || !sketchCtx) return;
  const rect = sketchCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  sketchCtx.fillStyle = "#000000";
  sketchCtx.beginPath();
  sketchCtx.arc(x, y, 3, 0, Math.PI * 2);
  sketchCtx.fill();
}

const btnClearSketch = document.getElementById("btnClearSketch");
const btnGenerateFromSketch = document.getElementById("btnGenerateFromSketch");
const sketchOutput = document.getElementById("sketchOutput");
const guidanceScaleInput = document.getElementById("guidanceScale");
const numStepsInput = document.getElementById("numSteps");

btnClearSketch.addEventListener("click", () => {
  if (sketchCtx) {
    sketchCtx.fillStyle = "#ffffff";
    sketchCtx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
  }
});

btnGenerateFromSketch.addEventListener("click", async () => {
  console.log("Generate button clicked!");
  
  const guidanceScale = guidanceScaleInput.value;
  const numSteps = numStepsInput.value;
  
  // Get prompt from the text input field
  const promptInput = document.getElementById("sketchPrompt");
  console.log("Prompt input element:", promptInput);
  
  const userPrompt = promptInput ? promptInput.value.trim() : "";
  console.log("User prompt:", userPrompt);
  
  if (!userPrompt) {
    alert("Please enter a description of what you want to create!");
    return;
  }

  console.log("Creating blob from canvas...");
  const blob = await new Promise((resolve) =>
    sketchCanvas.toBlob(resolve, "image/png")
  );
  console.log("Blob created:", blob);

  const formData = new FormData();
  formData.append("image", blob, "sketch.png");
  formData.append("guidance_scale", guidanceScale);
  formData.append("num_steps", numSteps);
  formData.append("prompt", userPrompt);
  
  console.log("Sending request to /api/sketch_to_image with prompt:", userPrompt);

  try {
    const resp = await apiSketchToImage(formData);
    console.log("Response status:", resp.status);
    
    if (!resp.ok) {
      console.error("Request failed with status:", resp.status);
      alert("Sketch generation failed.");
      return;
    }
    
    const data = await resp.json();
    console.log("Response data received, setting image...");
    sketchOutput.src = "data:image/png;base64," + data.generated_image;
    console.log("Image set successfully!");
  } catch (error) {
    console.error("Error during sketch generation:", error);
    alert("Error: " + error.message);
  }
});

// ========== 3) BOSS BATTLE ==========
// Boss battle logic is in boss_battle.js
let bossBattle = new BossBattle();

// ========== 4) SHADOW INVERTER ==========
// ========== 4) SHADOW INVERTER ==========
let shadowInverter = new ShadowInverterGame();

// ========== 5) TARGET TAGGER ==========
let targetTagger = new TargetTaggerGame();

