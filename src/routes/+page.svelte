<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	// ─── Fallback coordinates (Berlin) ────────────────────────────────────────
	const BERLIN: [number, number] = [13.405, 52.52];

	// Free MapLibre-compatible dark style via OpenMapTiles / CARTO Basemaps
	// No token required.
	const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

	type AppState = 'idle' | 'traveling' | 'exploring';

	let mapContainer: HTMLDivElement;
	let map = $state<MapLibreMap | null>(null);
	let currentZoom = $state(13);
	let homeLocation = $state(BERLIN as [number, number]);
	let appState = $state<AppState>('idle');
	let searchQuery = $state('');
	let isSearching = $state(false);
	
	let exploreAnimationFrame: number | null = null;

	// Derived values for smooth transitions
	// Phase 1: Map (Zoom 13 -> 6)
	// Phase 2: Transition (Zoom 6 -> 2)
	// Phase 3: Cosmic (Zoom 2 -> 0)
	
	const transitionProgress = $derived(Math.max(0, Math.min(1, (6 - currentZoom) / 4))); // 0 at z6, 1 at z2
	const cosmicProgress = $derived(Math.max(0, Math.min(1, (3 - currentZoom) / 3)));     // 0 at z3, 1 at z0
	const earthScale = $derived(0.8 + (1 - transitionProgress) * 0.4); // slightly bigger as we zoom in

	const toggleMapInteractivity = (enabled: boolean) => {
		if (!map) return;
		if (enabled) {
			map.dragPan.enable();
			map.scrollZoom.enable();
			map.doubleClickZoom.enable();
			map.touchZoomRotate.enable();
			map.keyboard.enable();
		} else {
			map.dragPan.disable();
			map.scrollZoom.disable();
			map.doubleClickZoom.disable();
			map.touchZoomRotate.disable();
			map.keyboard.disable();
		}
	};

	const stopExploration = () => {
		if (exploreAnimationFrame) {
			cancelAnimationFrame(exploreAnimationFrame);
			exploreAnimationFrame = null;
		}
	};

	const startExploration = () => {
		if (!map) return;
		let startTime = performance.now();
		const explore = (time: number) => {
			if (appState !== 'exploring' || !map) return;
			const dt = time - startTime;
			startTime = time;
			
			// Gently rotate bearing and slightly adjust pitch
			const bearing = map.getBearing() + (dt * 0.001);
			const pitch = 50 + Math.sin(time * 0.0001) * 5;
			
			map.jumpTo({ bearing, pitch });
			
			if (appState === 'exploring') {
				exploreAnimationFrame = requestAnimationFrame(explore);
			}
		};
		exploreAnimationFrame = requestAnimationFrame(explore);
	};

	onMount(async () => {
		// Dynamic import keeps maplibre-gl out of the SSR bundle entirely
		const maplibregl = (await import('maplibre-gl')).default;

		/**
		 * Interaction logic: Fly back to home location on Spacebar
		 */
		const handleKeydown = (e: KeyboardEvent) => {
			// Don't trigger if user is typing in the search input
			if (e.target instanceof HTMLInputElement) return;

			if (e.code === 'Space' && map && appState !== 'traveling') {
				e.preventDefault(); // prevent scroll
				
				if (appState === 'exploring') stopExploration();
				appState = 'traveling';
				toggleMapInteractivity(false);

				map.flyTo({
					center: homeLocation,
					zoom: 13,
					speed: 0.8,     // slightly slower for "cinematic" feel
					curve: 1,       // smooth zoom-out-in curve
					essential: true
				});
				
				map.once('moveend', () => {
					if (appState === 'traveling') {
						appState = 'idle';
						toggleMapInteractivity(true);
					}
				});
			}
		};
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
				({ coords }) => {
					homeLocation = [coords.longitude, coords.latitude];
					initMap(homeLocation);
				},
				()          => initMap(BERLIN),
				{ timeout: 6000, maximumAge: 60_000 }
			);
		} else {
			initMap(BERLIN);
		}

		window.addEventListener('keydown', handleKeydown);

		// ── Cleanup on component destroy ──────────────────────────────────────
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			stopExploration();
			map?.remove();
			map = null;
		};
	});

	const handleSearch = async (e: KeyboardEvent) => {
		if (e.key === 'Enter' && searchQuery.trim().length > 0 && map && appState === 'idle') {
			isSearching = true;
			try {
				const query = encodeURIComponent(searchQuery);
				const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`);
				const data = await res.json();
				if (data && data.length > 0) {
					const { lat, lon } = data[0];
					const destination: [number, number] = [parseFloat(lon), parseFloat(lat)];
					
					appState = 'traveling';
					
					// Disable interactivity directly here since map is available
					map.dragPan.disable();
					map.scrollZoom.disable();
					map.doubleClickZoom.disable();
					map.touchZoomRotate.disable();
					map.keyboard.disable();

					map.flyTo({
						center: destination,
						zoom: 5.5, // A good overview zoom for an average country
						speed: 0.15, // VERY slow
						curve: 1.8, // swooping high up into the cosmic space layer
						pitch: 45,
						essential: true
					});
					
					map.once('moveend', () => {
						if (appState === 'traveling') {
							appState = 'exploring';
							startExploration();
						}
					});
				} else {
					console.warn('Destination not found');
				}
			} catch (err) {
				console.error('Search failed', err);
			} finally {
				isSearching = false;
				searchQuery = ''; // clear input
			}
		}
	};
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

	<!-- Top Overlay with UI -->
	<div class="ui-layer">
		<div class="search-container" class:active={searchQuery.length > 0 || isSearching}>
			<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8"></circle>
				<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
			</svg>
			<input 
				type="text" 
				bind:value={searchQuery} 
				onkeydown={handleSearch} 
				placeholder="Where to...?"
				disabled={appState !== 'idle' || isSearching}
			/>
			{#if isSearching}
				<div class="search-spinner"></div>
			{/if}
			{#if appState !== 'idle'}
				<div class="state-indicator">
					{appState === 'traveling' ? 'Traveling...' : 'Wandering...'}
				</div>
			{/if}
		</div>
	</div>

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
		<div class="earth-container">
			<div class="earth-sphere">
				<div class="earth-surface"></div>
				<div class="earth-clouds"></div>
				<div class="earth-haze"></div>
				<div class="earth-terminator"></div>
			</div>
		</div>
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

	/* ── UI Layer ------------------------------------------------------------- */
	.ui-layer {
		position: absolute;
		top: 60px;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		z-index: 50;
		pointer-events: none;
	}
	
	.search-container {
		display: flex;
		align-items: center;
		background: rgba(10, 12, 20, 0.4);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		padding: 0 16px;
		border-radius: 30px;
		height: 52px;
		width: 260px;
		transition: all 0.5s cubic-bezier(0.2, 0, 0, 1);
		pointer-events: auto;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}
	
	.search-container:focus-within, .search-container.active {
		background: rgba(15, 18, 30, 0.6);
		border-color: rgba(255, 255, 255, 0.2);
		width: 320px;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
	}

	.search-icon {
		width: 18px;
		height: 18px;
		color: rgba(255, 255, 255, 0.7);
		margin-right: 12px;
		transition: color 0.3s;
	}
	.search-container.active .search-icon {
		color: #fff;
	}

	.search-container input {
		background: transparent;
		border: none;
		color: #fff;
		font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
		font-size: 15px;
		letter-spacing: 0.02em;
		flex: 1;
		outline: none;
		width: 100%;
	}

	.search-container input::placeholder {
		color: rgba(255, 255, 255, 0.5);
		transition: opacity 0.3s;
	}
	.search-container:focus-within input::placeholder {
		opacity: 0.5;
	}
	
	.search-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top-color: rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-left: 12px;
	}

	.state-indicator {
		font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.8);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin-left: 12px;
		animation: pulse-text 3s ease-in-out infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	@keyframes pulse-text {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
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

	.earth-container {
		position: relative;
		width: 60vh;
		height: 60vh;
		border-radius: 50%;
		/* Ensures everything inside stays spherical */
		mask-image: radial-gradient(circle, black 100%, transparent 100%);
		-webkit-mask-image: radial-gradient(circle, black 100%, transparent 100%);
		overflow: hidden;
		box-shadow: 0 0 100px rgba(56, 189, 248, 0.15);
	}

	.earth-sphere {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		background: #040815; /* Base deep space blue */
		border-radius: 50%;
	}

	.earth-surface {
		position: absolute;
		inset: 0;
		background-image: url('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg');
		background-size: auto 100%;
		background-repeat: repeat-x;
		opacity: 0.9;
		animation: rotate-earth 120s linear infinite;
		/* Cinematic land color grading */
		filter: contrast(1.1) brightness(0.9) saturate(1.2);
	}

	.earth-clouds {
		position: absolute;
		inset: -1%; /* Slightly larger for depth */
		background-image: url('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png');
		background-size: auto 100%;
		background-repeat: repeat-x;
		opacity: 0.6;
		mix-blend-mode: screen;
		animation: rotate-clouds 80s linear infinite;
	}

	.earth-haze {
		position: absolute;
		inset: 0;
		/* Inner blue scattering / Fresnel look */
		background: radial-gradient(circle at center, transparent 40%, rgba(56, 189, 248, 0.3) 75%, rgba(56, 189, 248, 0.6) 100%);
		pointer-events: none;
	}

	.earth-terminator {
		position: absolute;
		inset: 0;
		/* Fixed shadow relative to camera to simulate sun light source from top-left */
		background: radial-gradient(circle at 30% 30%, transparent 20%, rgba(0, 0, 0, 0.4) 60%, rgba(0, 0, 0, 0.9) 100%);
		pointer-events: none;
	}

	.earth-glow {
		position: absolute;
		width: 70vh;
		height: 70vh;
		background: radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, rgba(56, 189, 248, 0.05) 50%, transparent 75%);
		border-radius: 50%;
		filter: blur(40px);
		z-index: -1;
	}

	@keyframes rotate-earth {
		from { background-position: 0 0; }
		to { background-position: 200% 0; }
	}

	@keyframes rotate-clouds {
		from { background-position: 0 0; }
		to { background-position: -200% 0; }
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
