<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	// ─── Fallback coordinates (Berlin) ────────────────────────────────────────
	const BERLIN: [number, number] = [13.405, 52.52];

	// Free MapLibre-compatible dark style via OpenMapTiles / CARTO Basemaps
	// No token required.
	const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

	let mapContainer: HTMLDivElement;
	let map = $state<MapLibreMap | null>(null);
	let currentZoom = $state(13);

	// Derived values for smooth transitions
	// Phase 1: Map (Zoom 13 -> 6)
	// Phase 2: Transition (Zoom 6 -> 2)
	// Phase 3: Cosmic (Zoom 2 -> 0)
	
	const transitionProgress = $derived(Math.max(0, Math.min(1, (6 - currentZoom) / 4))); // 0 at z6, 1 at z2
	const cosmicProgress = $derived(Math.max(0, Math.min(1, (3 - currentZoom) / 3)));     // 0 at z3, 1 at z0
	const earthScale = $derived(0.8 + (1 - transitionProgress) * 0.4); // slightly bigger as we zoom in

	onMount(async () => {
		// Dynamic import keeps maplibre-gl out of the SSR bundle entirely
		const maplibregl = (await import('maplibre-gl')).default;

		/**
		 * Initialise the MapLibre map centered on `center`.
		 * Kept as a self-contained function so the geolocation branch
		 * and the fallback branch share identical setup logic.
		 */
		const initMap = (center: [number, number]) => {
			map = new maplibregl.Map({
				container: mapContainer,
				style: DARK_STYLE,
				center,
				zoom: 13,
				pitch: 25,         // slight tilt — atmospheric but subtle
				bearing: 0,
				antialias: true,
				// ── Remove all default controls ──────────────────────────────
				attributionControl: false
			});

			// Update zoom state
			map.on('zoom', () => {
				if (map) currentZoom = map.getZoom();
			});

			// No zoom/navigation buttons
			// (MapLibre adds NavigationControl by default only if you call addControl)

			// ── "You are here" marker ──────────────────────────────────────
			const el = document.createElement('div');
			el.className = 'you-are-here';

			// Inline label so markup stays inside the component
			const label = document.createElement('span');
			label.className = 'you-are-here__label';
			label.textContent = 'You are here';
			el.appendChild(label);

			new maplibregl.Marker({ element: el, anchor: 'center' })
				.setLngLat(center)
				.addTo(map);

			// ── Minimal attribution (legal requirement) ───────────────────
			// We keep a tiny, low-opacity attribution instead of removing it.
			map.addControl(
				new maplibregl.AttributionControl({ compact: true }),
				'bottom-right'
			);
		};

		// ── Geolocation → Berlin fallback ─────────────────────────────────────
		if ('geolocation' in navigator) {
			navigator.geolocation.getCurrentPosition(
				({ coords }) => initMap([coords.longitude, coords.latitude]),
				()          => initMap(BERLIN),
				{ timeout: 6000, maximumAge: 60_000 }
			);
		} else {
			initMap(BERLIN);
		}

		// ── Cleanup on component destroy ──────────────────────────────────────
		return () => {
			map?.remove();
			map = null;
		};
	});
</script>

<svelte:head>
	<!-- MapLibre CSS — loaded as a stylesheet link so SSR renders fine -->
	<link
		rel="stylesheet"
		href="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css"
	/>
	<title>Perspective</title>
	<meta name="description" content="An immersive, full-screen map experience." />
</svelte:head>

<!-- Cosmic Workspace -->
<div class="perspective-container">
	<!-- Layer 0: Deep Space -->
	<div class="layer cosmic-background">
		<div class="stars"></div>
		<div class="stars-far"></div>
	</div>

	<!-- Layer 1: Abstract Earth Hint -->
	<div 
		class="layer earth-impression" 
		style:opacity={transitionProgress}
		style:transform="scale({earthScale})"
	>
		<div class="earth-glow"></div>
		<div class="earth-sphere"></div>
	</div>

	<!-- Layer 2: Map & Transition -->
	<div 
		class="layer map-wrap"
		style:filter="blur({transitionProgress * 20}px) brightness({1 - transitionProgress * 0.7})"
		style:opacity={1 - cosmicProgress}
	>
		<div bind:this={mapContainer} class="map" />
		
		<!-- Visual Overlay for extra atmosphere -->
		<div 
			class="transition-overlay"
			style:opacity={transitionProgress * 0.5}
		></div>
	</div>
</div>

<style>
	/* ── Reset ---------------------------------------------------------------- */
	:global(html, body) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #080810; /* deep space black — visible before tiles load */
	}

	/* ── Container System ----------------------------------------------------- */
	.perspective-container {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		background: #020205;
	}
	
	.layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		transition: opacity 0.5s cubic-bezier(0.2, 0, 0.4, 1), 
		            filter 0.5s cubic-bezier(0.2, 0, 0.4, 1),
		            transform 0.5s cubic-bezier(0.2, 0, 0.4, 1);
		pointer-events: none; /* Default layer behavior */
	}

	/* ── Layer 2: Map --------------------------------------------------------- */
	.map-wrap {
		z-index: 10;
		pointer-events: all; /* Important: Map must receive events */
		will-change: filter, opacity;
	}

	.map {
		width: 100%;
		height: 100%;
	}

	/* Subtle glass overlay on top of map during transition */
	.transition-overlay {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at center, transparent 30%, rgba(8, 10, 20, 0.8) 100%);
		pointer-events: none;
	}

	/* ── Layer 1: Earth Impression --------------------------------------------- */
	.earth-impression {
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		will-change: transform, opacity;
	}

	.earth-sphere {
		width: 60vh;
		height: 60vh;
		background: radial-gradient(
			circle at 30% 30%,
			#1e3a8a 0%,
			#0f172a 60%,
			#020617 100%
		);
		border-radius: 50%;
		box-shadow: 
			inset -20px -20px 50px rgba(0, 0, 0, 0.8),
			inset 20px 20px 60px rgba(255, 255, 255, 0.1);
	}

	.earth-glow {
		position: absolute;
		width: 65vh;
		height: 65vh;
		background: radial-gradient(circle, rgba(56, 189, 248, 0.2) 0%, transparent 70%);
		border-radius: 50%;
		filter: blur(20px);
	}

	/* ── Layer 0: Cosmic Background -------------------------------------------- */
	.cosmic-background {
		z-index: 1;
		background: radial-gradient(circle at center, #0a0a1a 0%, #020205 100%);
		overflow: hidden;
	}

	/* Simple starfield generator */
	.stars {
		position: absolute;
		inset: 0;
		background-image: 
			radial-gradient(1px 1px at 20px 30px, #fff, rgba(0,0,0,0)),
			radial-gradient(1.5px 1.5px at 100px 150px, #fff, rgba(0,0,0,0)),
			radial-gradient(1px 1px at 200px 80px, #fff, rgba(0,0,0,0)),
			radial-gradient(2px 2px at 300px 250px, #fff, rgba(0,0,0,0));
		background-size: 400px 400px;
		opacity: 0.4;
		animation: drift 120s linear infinite;
	}

	.stars-far {
		position: absolute;
		inset: 0;
		background-image: 
			radial-gradient(1px 1px at 50px 50px, #fff, rgba(0,0,0,0)),
			radial-gradient(1px 1px at 150px 200px, #fff, rgba(0,0,0,0));
		background-size: 300px 300px;
		opacity: 0.2;
		animation: drift 200s linear infinite reverse;
	}

	@keyframes drift {
		from { transform: rotate(0deg) scale(1); }
		to { transform: rotate(360deg) scale(1.2); }
	}

	/* ── "You are here" marker ------------------------------------------------ */
	:global(.you-are-here) {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		/* No pointer-events interference */
		pointer-events: none;
	}

	/* Pulsing dot */
	:global(.you-are-here::before) {
		content: '';
		display: block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #ffffff;
		box-shadow:
			0 0 0 0   rgba(255, 255, 255, 0.6),
			0 0 18px  rgba(255, 255, 255, 0.35);
		animation: pulse-dot 2.8s ease-in-out infinite;
	}

	/* Outer ring ripple */
	:global(.you-are-here::after) {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%) scale(0.6);
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1.5px solid rgba(255, 255, 255, 0.45);
		animation: pulse-ring 2.8s ease-out infinite;
	}

	/* Label beneath the dot */
	:global(.you-are-here__label) {
		font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
		font-size: 10px;
		font-weight: 400;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
		white-space: nowrap;
		/* Subtle drop shadow so it reads on any tile */
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
		margin-top: 8px;
	}

	@keyframes pulse-dot {
		0%, 100% { transform: scale(1);    opacity: 1;   }
		50%       { transform: scale(1.3); opacity: 0.65; }
	}

	@keyframes pulse-ring {
		0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0.7; }
		70%  { transform: translate(-50%, -50%) scale(1.4); opacity: 0;   }
		100% { transform: translate(-50%, -50%) scale(0.6); opacity: 0;   }
	}

	/* ── Attribution — keep it legal but unobtrusive ------------------------- */
	:global(.maplibregl-ctrl-attrib) {
		background: rgba(8, 8, 16, 0.55) !important;
		backdrop-filter: blur(6px);
		border-radius: 4px 0 0 0;
		font-size: 9px !important;
		color: rgba(255, 255, 255, 0.3) !important;
	}

	:global(.maplibregl-ctrl-attrib a) {
		color: rgba(255, 255, 255, 0.3) !important;
	}
</style>
