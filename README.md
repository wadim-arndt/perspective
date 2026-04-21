# Perspective

A minimal immersive web experience that starts from a real-world location and zooms out into an abstract Earth and space perspective.

## Concept

**Perspective** is a visual journey designed around the transition of scale:
- **Local:** Starts at your current geolocation (or Berlin).
- **Global:** Smoothly transitions into an abstract Earth view.
- **Cosmic:** Scales out into a stylized space perspective.

The core of the experience is the **zoom as storytelling**—moving from the granular detail of the street level to the vastness of the cosmos.

---

## Tech Stack

- **Framework:** [SvelteKit](https://kit.svelte.dev/)
- **Map Engine:** [MapLibre GL JS](https://maplibre.org/)
- **Languages:** JavaScript / TypeScript
- **Bundler:** Vite

## Features

- [x] **Geolocation-based start:** Automatically centers the map on your location (with fallback).
- [x] **Seamless Zoom:** Optimized transition between map zoom levels.
- [x] **"You are here" Marker:** A minimalist pulsing indicator for the starting point.
- [x] **Earth Abstraction:** Visual layers that transition the map into a cosmic sphere at low zooms.

---

## Setup & Installation

### Prerequisites
- **Node.js:** version 18.0 or higher
- **npm:** (included with Node.js)

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/wadim-arndt/perspective.git
   cd perspective
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Launch the app:**
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Usage

- **Zoom:** Use your mouse wheel or trackpad to scale the perspective.
- **Navigate:** Click and drag to explore the map.
- **Cosmic View:** Zoom all the way out to experience the abstract Earth and space layers.
- *Note: Additional keyboard controls (like Spacebar to reset) are planned for future updates.*

## Future Ideas

- [ ] **Enhanced Earth Visualization:** Higher fidelity textures and atmospheric shaders.
- [ ] **Space Scene:** Integrating Three.js or particle systems for a more dynamic starfield.
- [ ] **Narrative Zoom Stages:** Contextual information appearing at different atmospheric levels.

---

*Built with focus on minimal aesthetics and immersive interaction.*
