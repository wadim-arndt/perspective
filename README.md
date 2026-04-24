# 🌍 Perspective

> "Experience the world as a fluid, interconnected space—from the streets to the stars."

**Perspective** is an immersive digital travel tool designed to shift how you navigate the globe. It transforms traditional map exploration into a continuous, cinematic journey—moving you seamlessly from your local surroundings to distant corners of the Earth, and ultimately into the vastness of the solar system.

---

## ✨ The Concept

We often interact with digital maps in fragmented ways: clicking, jumping, loading. **Perspective** connects these disconnected moments into a continuous flow. 

You begin anchored in a real-world location. From there, you search for a country, smoothly traverse the globe, and engage in a guided, algorithmic exploration. But the journey doesn't stop at the atmosphere. **Perspective** allows you to pull back further, revealing the Earth as a single blue marble within a fully realized 3D solar system. It is a tool for scale, movement, and geographical—and cosmic—awareness.

---

## 🧭 Journey Flow

The experience is structured as a continuous narrative of scale:

*   📍 **Presence:** Ground yourself in your current location with high-fidelity satellite imagery.
*   🌐 **Travel:** A sweeping transition lifts you out and carries you across the Earth to any destination.
*   🗺️ **Arrival:** Settle onto a curated overview of your selected country.
*   🏙️ **Drift:** An automated, guided sequence gently flies you through distinct cities within the country.
*   🔭 **Cosmos:** Pull back beyond the atmosphere to witness the Earth orbiting within a 3D solar system, surrounded by a dynamic starfield.

---

## 🕹️ Core Features

*   🌍 **Universal Search:** Effortlessly jump to any country across the globe with a minimal, blurred search interface.
*   ✈️ **Cinematic Navigation:** Smooth, multi-stage flight paths with easing curves and atmospheric transitions.
*   🏙️ **Wandering Mode:** An algorithmic exploration feature that intelligently fetches and guides you through 3 real cities within your chosen country.
*   🌌 **Cosmic Perspective:** A seamless transition from the map into a 3D Three.js scene featuring all 8 planets, the Sun, and an interactive starfield.
*   ⚙️ **Dynamic Controls:** 
    *   `Enter` → Begin a journey from the search interface.
    *   `Space` → Return home instantly with a cinematic "Grounding" sequence.
    *   `Q` → Exit wandering mode and return to the country overview.
    *   `Wheel` → Continuous zoom from street level to planetary orbits.
    *   `Drag` → Pan across the map or drift through the solar system with inertial movement.

---

## 🎨 Experience Design

*   **Digital Traveling:** Replacing static clicks with the feeling of motion and geographical relationship.
*   **Satellite Realism:** Utilizing high-fidelity satellite layers for a sharp, recognizable Earth at all scales.
*   **Atmospheric Depth:** Layered visual effects, including a radial atmosphere glow and a multi-layered parallax starfield.
*   **Minimalist UI:** A "stealth" interface that surfaces only when needed, keeping the focus on the visualization.

---

## 🛠️ Tech Stack

*   **Svelte 5 (Runes):** Modern, reactive state management for a fluid user interface.
*   **MapLibre GL JS:** High-performance vector/satellite map engine for smooth flights.
*   **Three.js:** Powering the 3D cosmic scenes and planetary visualizations.
*   **TypeScript:** A robust, type-safe architecture for complex spatial logic.
*   **Nominatim API:** Open-source geocoding for intelligent city selection and spatial context.

---

## 🚀 Setup & Installation

Experience the journey locally on your machine.

### Prerequisites
- **Node.js:** 20.0 or higher
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

3. **Ignite the server:**
   ```bash
   npm run dev
   ```

4. **Begin the journey:**
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🔭 Future Vision

The journey continues. Future iterations of **Perspective** aim to introduce:

*   **Atmospheric Audio:** Generative soundscapes that shift based on altitude and location.
*   **Smarter City Selection:** Prioritizing cultural capitals and landmarks during the Wandering sequence.
*   **Rich Data Integration:** Subtly introducing local metadata (timezones, weather, or brief cultural facts).

---

*Designed for the curious. Built for the travelers.*
