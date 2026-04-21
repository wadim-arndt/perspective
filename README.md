# 🌍 Perspective

> "Experience the world as a fluid, interconnected space."

**Perspective** is an immersive digital travel tool designed to shift how you navigate the globe. It transforms traditional map exploration into a continuous, cinematic journey—moving you seamlessly from your local surroundings to distant corners of the Earth.

---

## ✨ The Concept

We often interact with digital maps in fragmented ways: clicking, jumping, loading. **Perspective** connects these disconnected moments into a continuous flow. 

You begin anchored in a real-world location. From there, you search for a country, smoothly traverse the globe, and engage in a guided, algorithmic exploration. It is the feeling of *digital traveling*—a curated sequence of scale, movement, and geography.

---

## 🧭 Journey Flow

The experience is structured as a continuous narrative of movement:

*   📍 **Start:** The journey begins exactly where you are, grounding the experience in reality.
*   🌐 **Travel:** A smooth, sweeping transition lifts you out and carries you across the Earth to your destination.
*   🗺️ **Arrival:** The camera settles onto a high-fidelity satellite overview of your selected country.
*   🏙️ **Wandering:** An automated, guided sequence gently flies you through three distinct cities within the country.
*   🔄 **Return:** The sequence concludes by pulling back, leaving you in a calm, interactive country overview.

---

## 🕹️ Core Features

*   🌍 **Country Search:** Effortlessly jump to any country across the globe with a minimal search interface.
*   ✈️ **Cinematic Travel:** Smooth, two-stage flight paths that zoom out to a global scale before descending into a new region.
*   🏙️ **Wandering Mode:** An algorithmic exploration feature that intelligently fetches and guides you through 3 real cities within your chosen country.
*   ⏱️ **Timed Exploration:** Each city visit holds for about 15 seconds, complete with subtle, dynamic micro-movements.
*   ⌨️ **Controls:** 
    *   `Enter` → Start a journey from the search bar
    *   `Q` → Instantly exit Wandering Mode and return to the country overview
*   🧭 **Free Navigation:** After a journey concludes, full manual pan and zoom controls are restored for open exploration.

---

## 🎨 Experience Design

*   **Digital Traveling:** The focus is on the feeling of motion and the geographical relationship between places, replacing static interactions with fluid movement.
*   **Satellite Realism:** A crystal-clear, high-fidelity satellite base layer ensures the Earth looks real, sharp, and recognizable at all zoom levels.
*   **Calm Pacing:** No abrupt cuts or blurry transitions. Easing curves and slow camera speeds create a deliberate, relaxing experience.
*   **Invisible UI:** The interface remains minimal, surfacing only when necessary to start a new journey or initiate a wander.

---

## 🖱️ Interaction

This tool is designed to be experienced as both a guided journey and a free-roaming map.

1.  **Search:** Enter a country name to begin your journey.
2.  **Watch:** Sit back and experience the automated flights and Wandering sequences.
3.  **Explore:** Once a sequence ends (or is cancelled), the map unlocks. Freely pan, scroll, and zoom to manually explore the country at your own pace.

---

## 🛠️ Tech Stack

*   **SvelteKit:** The foundation for a fast, modern web experience.
*   **MapLibre GL JS:** Empowering the high-performance satellite map and fluid camera flights.
*   **TypeScript:** Ensuring a robust and scalable architecture.
*   **Nominatim API:** Open-source geocoding for intelligent city selection and bounding.

---

## 🚀 Setup & Installation

Experience the journey locally on your machine.

### Prerequisites
- **Node.js:** 18.0 or higher
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

*   **Smarter City Selection:** Prioritizing cultural capitals and landmarks during the Wandering sequence.
*   **Rich Data Integration:** Subtly introducing local metadata (timezones, temperatures, or brief cultural facts) upon arrival.
*   **Storytelling Layers:** Evolving from algorithmic exploration into curated, narrative-driven geographic journeys.

---

*Designed for the curious. Built for the travelers.*
