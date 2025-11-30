# AI Playground Arena — Static Website Version

This folder contains a static copy of the frontend so you can serve the site without running the Flask backend.

To run locally using Python's simple HTTP server (Windows CMD):

```
cd c:\Users\HP\Desktop\Robotics\website
python -m http.server 8000
```

Then open `http://127.0.0.1:8000/` in your browser. The frontend will attempt to contact `/api/*` endpoints on the same host; if no backend is reachable the site uses a client-side simulator to demo features.

If you want full functionality (real detection / diffusion), run the Flask app in the repository root and open the Flask server URL instead.
