<script lang="ts">
	import { onMount } from 'svelte';
	import Starfield from '$lib/components/Starfield.svelte';
	import GlobeScene from '$lib/components/GlobeScene.svelte';
	
	// Refactored logic imports
	import { perspectiveState as pState } from '$lib/hooks/usePerspectiveState.svelte';
	import { useMap } from '$lib/hooks/useMap.svelte';
	import { useWandering } from '$lib/hooks/useWandering.svelte';
	import { useCosmic } from '$lib/hooks/useCosmic.svelte';
	import { useSearch } from '$lib/hooks/useSearch.svelte';
	import { useControls } from '$lib/hooks/useControls.svelte';
	import { BERLIN } from '$lib/constants';

	// Initialize controllers
	const mapHelper = useMap();
	const wandering = useWandering();
	const cosmic = useCosmic();
	const search = useSearch();
	const controls = useControls({ wandering, mapHelper, cosmic });

	let mapContainer: HTMLDivElement;
	let perspectiveContainer: HTMLDivElement;
	let searchQuery = $state('');

	// ─── Declarative visual state ─────────────────────────────────────────────
	let mapOpacity = $derived(Math.max(0, Math.min(1, pState.virtualZoom - 0.5)));
	let starfieldVisible = $derived(pState.virtualZoom < 1.5);
	let globeVisible = $derived(pState.virtualZoom < 1.5);
	let solarProgress = $derived(Math.max(0, Math.min(1, -pState.virtualZoom / 2)));
	let cosmicInteractive = $derived(pState.isInCosmicMode && globeVisible);

	// ─── Handlers ─────────────────────────────────────────────────────────────
	const onSearchSubmit = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && searchQuery.trim().length > 0) {
			if (pState.appState === 'wandering') {
				wandering.stop();
				pState.setLocationContext(null);
			}
			search.performSearch(searchQuery);
			searchQuery = ''; 
		}
	};

	onMount(async () => {
		const maplibregl = (await import('maplibre-gl')).default;

		const startInit = (center: [number, number]) => {
			mapHelper.initMap(maplibregl, mapContainer, center);
			
			// "You are here" marker
			const el = document.createElement('div');
			el.className = 'you-are-here';
			const label = document.createElement('span');
			label.className = 'you-are-here__label';
			label.textContent = 'You are here';
			el.appendChild(label);

			new maplibregl.Marker({ element: el, anchor: 'center' })
				.setLngLat(center)
				.addTo(pState.map!);

			pState.map!.addControl(
				new maplibregl.AttributionControl({ compact: true }),
				'bottom-left'
			);
		};

		// Initial Geolocation
		if ('geolocation' in navigator) {
			navigator.geolocation.getCurrentPosition(
				({ coords }) => {
					pState.setHomeLocation(coords.longitude, coords.latitude);
					startInit(pState.homeLocation);
				},
				() => startInit(BERLIN),
				{ timeout: 6000, maximumAge: 60_000 }
			);
		} else {
			startInit(BERLIN);
		}

		controls.setup(perspectiveContainer);

		return () => {
			controls.cleanup(perspectiveContainer);
			wandering.stop();
			pState.map?.remove();
			pState.setMap(null);
		};
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css" />
	<title>Perspective</title>
	<meta name="description" content="An immersive, full-screen map experience." />
</svelte:head>

<div bind:this={perspectiveContainer} class="perspective-container">
	<!-- UI: Location Context -->
	{#if pState.appState === 'wandering' && pState.currentLocationContext}
		<div class="location-context">
			<div class="context-city">{pState.currentLocationContext.city}</div>
			<div class="context-region">
				{#if pState.currentLocationContext.state}{pState.currentLocationContext.state}, {/if}
				{pState.currentLocationContext.country}
				{#if pState.currentLocationContext.distanceFromHome !== undefined}
					<span class="context-distance">— about {pState.currentLocationContext.distanceFromHome} km away</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- UI: Top Overlay -->
	<div class="ui-layer">
		<div class="search-container" class:active={searchQuery.length > 0 || pState.isSearching}>
			<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8"></circle>
				<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
			</svg>
			<input 
				type="text" 
				bind:value={searchQuery} 
				onkeydown={onSearchSubmit} 
				placeholder="Where to...?"
				disabled={!['idle', 'arrived', 'wandering'].includes(pState.appState) || pState.isSearching}
			/>
			{#if pState.isSearching}
				<div class="search-spinner"></div>
			{/if}
			{#if pState.appState !== 'idle' && pState.appState !== 'arrived'}
				<div class="state-indicator">
					{pState.appState === 'zooming_out' || pState.appState === 'zooming_in' ? 'Traveling...' : 
					 pState.appState === 'returning' ? 'Returning...' : 'Wandering...'}
				</div>
			{/if}
			{#if pState.appState === 'arrived'}
				<div class="action-group">
					<button class="wander-btn" onclick={() => {
						pState.setAppState('wandering');
						wandering.start();
					}}>
						{pState.visitedCities.size > 0 ? '▶ Continue exploring' : 'Wander'}
					</button>
					{#if pState.visitedCities.size > 0}
						<button class="wander-btn end-btn" onclick={() => {
							pState.setAppState('idle');
							pState.clearVisitedCities();
							pState.setLocationContext(null);
							mapHelper.toggleInteractivity(true);
						}}>
							❌ End
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Background Layers -->
	<Starfield visible={starfieldVisible} />
	<GlobeScene visible={globeVisible} progress={solarProgress} interactive={cosmicInteractive} />

	<!-- Map Layer -->
	<div class="layer map-wrap" style="opacity: {mapOpacity}; pointer-events: {pState.isInCosmicMode ? 'none' : 'all'};">
		<div bind:this={mapContainer} class="map"></div>
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
		background: #080810;
	}

	.perspective-container {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		background: #020205;
	}

	.location-context {
		position: absolute;
		bottom: 80px;
		left: 60px;
		z-index: 40;
		color: #fff;
		font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
		pointer-events: none;
		text-shadow: 0 4px 16px rgba(0, 0, 0, 0.8), 0 1px 4px rgba(0, 0, 0, 0.5);
		animation: fade-in 1s ease-out;
	}
	.context-city {
		font-size: 42px;
		font-weight: 300;
		letter-spacing: 0.02em;
		margin-bottom: 8px;
		line-height: 1.1;
	}
	.context-region {
		font-size: 15px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.75);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.context-distance {
		color: rgba(255, 255, 255, 0.5);
		font-variant-numeric: tabular-nums;
	}

	@keyframes fade-in {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.ui-layer {
		position: absolute;
		top: 60px;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		z-index: 1000;
		pointer-events: none;
	}
	
	.search-container {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		background: rgba(10, 12, 20, 0.4);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		padding: 0 16px;
		border-radius: 30px;
		height: 52px;
		max-width: 90vw;
		transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
		pointer-events: auto;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}
	
	.search-container:focus-within, .search-container.active {
		background: rgba(15, 18, 30, 0.6);
		border-color: rgba(255, 255, 255, 0.2);
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
	}

	.search-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.7);
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
		outline: none;
		width: 100px;
		transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.search-container:focus-within input, .search-container.active input {
		width: 220px;
	}

	.search-container input::placeholder {
		color: rgba(255, 255, 255, 0.5);
		transition: opacity 0.3s;
	}
	
	.search-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top-color: rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		flex-shrink: 0;
	}

	.state-indicator {
		font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.8);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		white-space: nowrap;
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
		pointer-events: none;
	}

	.action-group {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.wander-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #fff;
		font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
		font-size: 13px;
		letter-spacing: 0.05em;
		padding: 6px 14px;
		border-radius: 20px;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s;
	}
	.wander-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}
	.end-btn {
		background: rgba(255, 100, 100, 0.15);
		border-color: rgba(255, 100, 100, 0.3);
	}
	.end-btn:hover {
		background: rgba(255, 100, 100, 0.25);
	}

	:global(.maplibregl-control-container) {
		z-index: 1 !important;
	}

	.map-wrap {
		z-index: 10;
		pointer-events: all;
		will-change: opacity;
		transition: opacity 0.6s ease;
	}

	.map {
		width: 100%;
		height: 100%;
	}

	:global(.you-are-here) {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		pointer-events: none;
	}

	:global(.you-are-here::before) {
		content: '';
		display: block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #ffffff;
		box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.6), 0 0 18px rgba(255, 255, 255, 0.35);
		animation: pulse-dot 2.8s ease-in-out infinite;
	}

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

	:global(.you-are-here__label) {
		font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
		font-size: 10px;
		font-weight: 400;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.55);
		white-space: nowrap;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
		margin-top: 8px;
	}

	@keyframes pulse-dot {
		0%, 100% { transform: scale(1); opacity: 1; }
		50% { transform: scale(1.3); opacity: 0.65; }
	}

	@keyframes pulse-ring {
		0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0.7; }
		70% { transform: translate(-50%, -50%) scale(1.4); opacity: 0; }
		100% { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
	}

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
