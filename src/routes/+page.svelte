<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import Starfield from '$lib/components/Starfield.svelte';
	import GlobeScene from '$lib/components/GlobeScene.svelte';

	// ─── Fallback coordinates (Berlin) ────────────────────────────────────────
	const BERLIN: [number, number] = [13.405, 52.52];

	// Free MapLibre-compatible satellite style
	const SATELLITE_STYLE = {
		version: 8,
		sources: {
			satellite: {
				type: 'raster',
				tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
				tileSize: 256
			},
			reference: {
				type: 'raster',
				tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
				tileSize: 256
			}
		},
		layers: [
			{ id: 'satellite-layer', type: 'raster', source: 'satellite' },
			{ id: 'reference-layer', type: 'raster', source: 'reference' }
		]
	};

	interface LocationContext {
		lng: number;
		lat: number;
		city: string;
		state: string;
		country: string;
		distanceFromHome?: number;
	}

	const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
		const R = 6371; // Earth's radius in km
		const dLat = (lat2 - lat1) * Math.PI / 180;
		const dLon = (lon2 - lon1) * Math.PI / 180;
		const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
			Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
			Math.sin(dLon/2) * Math.sin(dLon/2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		return Math.round(R * c);
	};

	type AppState = 'idle' | 'zooming_out' | 'zooming_in' | 'arrived' | 'wandering' | 'returning';

	let mapContainer: HTMLDivElement;
	let map = $state<MapLibreMap | null>(null);
	let currentZoom = $state(13);
	let homeLocation = $state(BERLIN as [number, number]);
	let appState = $state<AppState>('idle');
	let searchQuery = $state('');
	let isSearching = $state(false);
	
	let currentLocationContext = $state<LocationContext | null>(null);
	let countryOverviewCenter = $state<[number, number] | null>(null);
	let lastSearchQuery = $state('');
	let lastCountryCode = $state<string | null>(null);
	
	let exploreTimeout: ReturnType<typeof setTimeout> | null = null;
	let isExplorationCancelled = false;
	let driftAnimationId: number;

	// ─── Cosmic Zoom State ────────────────────────────────────────────────────
	let virtualZoom = $state(13); // Extends below 0 for solar system
	let isInCosmicMode = $state(false); // True when MapLibre is at min zoom and we take over

	// ─── Derived visual states ────────────────────────────────────────────────
	// Map opacity: full at zoom >= 1.5, fades to 0 at zoom 0.5
	let mapOpacity = $derived(Math.max(0, Math.min(1, virtualZoom - 0.5)));
	// Starfield visible when map starts fading
	let starfieldVisible = $derived(virtualZoom < 1.5);
	// Globe visible when zoom < 1.5
	let globeVisible = $derived(virtualZoom < 1.5);
	// Solar system progress: 0 at zoom 0, 1 at zoom -2
	let solarProgress = $derived(Math.max(0, Math.min(1, -virtualZoom / 2)));
	// Globe is interactive (drag-to-pan) when in cosmic mode
	let cosmicInteractive = $derived(isInCosmicMode && globeVisible);

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
		isExplorationCancelled = true;
		if (exploreTimeout) {
			clearTimeout(exploreTimeout);
			exploreTimeout = null;
		}
		if (typeof driftAnimationId !== 'undefined') {
			cancelAnimationFrame(driftAnimationId);
		}
		if (map) map.stop();
	};

	const isValidLand = async (lng: number, lat: number): Promise<LocationContext | null> => {
		try {
			// zoom=10 corresponds roughly to city level; it ensures we hit a recognized landmass feature
			const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`);
			if (!res.ok) return null;
			const data = await res.json();
			
			// Nominatim typically returns an error for open ocean/unmapped regions
			if (data && data.error === 'Unable to geocode') return null;
			
			// Explicitly filter out identified water bodies
			const isWater = data.type === 'sea' || data.type === 'ocean' || data.type === 'water';
			if (isWater) return null;

			return {
				lng: data.lon ? parseFloat(data.lon) : lng,
				lat: data.lat ? parseFloat(data.lat) : lat,
				city: data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || data.name || 'Unknown Location',
				state: data.address?.state || data.address?.region || data.address?.county || '',
				country: data.address?.country || ''
			};
		} catch {
			return null;
		}
	};

	const fetchCities = async (searchQuery: string, countryCode: string | null): Promise<LocationContext[]> => {
		try {
			let data = [];
			
			// Strategy 1: Strict country code
			if (countryCode) {
				const res = await fetch(`https://nominatim.openstreetmap.org/search?countrycodes=${countryCode}&featuretype=city&format=json&limit=15&addressdetails=1`);
				data = await res.json();
			}
			
			// Strategy 2: Fallback to text query
			if (!data || data.length === 0) {
				const query = encodeURIComponent(`city ${searchQuery}`);
				const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=15&addressdetails=1`);
				data = await res.json();
			}
			
			if (!data || data.length === 0) return [];

			// Soft Match Filter
			let validData = data.filter((d: any) => {
				const cCode = d.address?.country_code;
				const cName = d.address?.country?.toLowerCase();
				const sQuery = searchQuery.toLowerCase();
				
				return (
					(countryCode && cCode === countryCode) ||
					(cName && cName.includes(sQuery)) ||
					(sQuery && cName === sQuery) ||
					(d.display_name?.toLowerCase().includes(sQuery))
				);
			});

			if (validData.length === 0) validData = data;

			// Extract structured context
			const cities: LocationContext[] = validData.map((d: any) => ({
				lng: parseFloat(d.lon),
				lat: parseFloat(d.lat),
				city: d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || d.name || 'Unknown Location',
				state: d.address?.state || d.address?.region || d.address?.county || '',
				country: d.address?.country || ''
			}));
			
			// Shuffle array
			for (let i = cities.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[cities[i], cities[j]] = [cities[j], cities[i]];
			}
			
			return cities;
		} catch (err) {
			console.error('Failed to fetch cities', err);
			return [];
		}
	};

	const returnToCountry = () => {
		if (!map || !countryOverviewCenter) return;
		appState = 'returning';
		map.flyTo({
			center: countryOverviewCenter,
			zoom: 5.5,
			speed: 0.8,
			curve: 1.2,
			pitch: 25,
			bearing: 0,
			essential: true
		});
		map.once('moveend', () => {
			if (appState === 'returning') {
				appState = 'idle';
				toggleMapInteractivity(true);
				isExplorationCancelled = false;
			}
		});
	};

	const startExploration = async () => {
		if (!map || appState !== 'wandering') return;
		isExplorationCancelled = false;
		
		let cities = await fetchCities(lastSearchQuery, lastCountryCode);
		
		// Fallback: Ensure exactly 3 destinations to avoid empty states
		// By prioritizing fetchCities, we ensure at least 2 real cities if the search resolves correctly.
		while (cities.length < 3) {
			const center = countryOverviewCenter || BERLIN;
			let validContext: LocationContext | null = null;
			let attempts = 0;
			
			// Validate random fallback points to ensure they land on valid terrain
			while (!validContext && attempts < 5) {
				const offsetLat = (Math.random() - 0.5) * 3; // +/- 1.5 degrees
				const offsetLng = (Math.random() - 0.5) * 3;
				
				if (isExplorationCancelled) return;
				
				validContext = await isValidLand(center[0] + offsetLng, center[1] + offsetLat);
				attempts++;
				
				// Small delay to prevent API spam on failed checks
				if (!validContext) await new Promise(resolve => setTimeout(resolve, 300));
			}
			if (validContext) {
				cities.push(validContext);
			} else {
				// Safety fallback if validation repeatedly fails
				if (cities.length > 0) cities.push({ ...cities[0] });
				else cities.push({ lng: center[0], lat: center[1], city: 'Unknown Location', state: '', country: lastCountryCode || '' });
			}
		}
		
		cities = cities.slice(0, 3);

		if (isExplorationCancelled) {
			returnToCountry();
			return;
		}

		const visitCity = (index: number) => {
			if (isExplorationCancelled || index >= cities.length) {
				currentLocationContext = null;
				returnToCountry();
				return;
			}

			const context = cities[index];
			context.distanceFromHome = calculateDistance(homeLocation[1], homeLocation[0], context.lat, context.lng);
			currentLocationContext = context;
			
			// 1. Smooth fly to city
			map!.flyTo({
				center: [context.lng, context.lat],
				zoom: 14 + Math.random() * 1.5, // between 14 and 15.5 (observable and spatial, not overly close)
				speed: 0.3,
				curve: 1.2,
				pitch: 45 + Math.random() * 15, // reduced from 55-70 to 45-60 for better overview
				essential: true
			});

			map!.once('moveend', () => {
				if (isExplorationCancelled) return;
				
				// 2. Continuous background drift that survives user interaction
				const driftDirection = Math.random() > 0.5 ? 1 : -1;
				let lastTime = performance.now();
				
				const drift = (time: number) => {
					if (isExplorationCancelled || appState !== 'wandering' || !map) return;
					
					const dt = time - lastTime;
					lastTime = time;
					
					// Only apply rotation if the user isn't actively rotating the map themselves
					if (!map.isRotating()) {
						map.setBearing(map.getBearing() + (0.5 * dt / 1000) * driftDirection);
					}
					
					driftAnimationId = requestAnimationFrame(drift);
				};
				
				if (typeof driftAnimationId !== 'undefined') cancelAnimationFrame(driftAnimationId);
				driftAnimationId = requestAnimationFrame(drift);

				// 3. Wait up to 15 seconds, then go to next city
				exploreTimeout = setTimeout(() => {
					if (isExplorationCancelled) return;
					if (typeof driftAnimationId !== 'undefined') cancelAnimationFrame(driftAnimationId);
					visitCity(index + 1);
				}, 15000);
			});
		};

		visitCity(0);
	};

	// ─── Cosmic Zoom Wheel Handler ────────────────────────────────────────────
	const handleCosmicWheel = (e: WheelEvent) => {
		if (!map) return;
		
		const mapZoom = map.getZoom();

		// Custom fixed-anchor zoom for wandering mode
		if (appState === 'wandering' && currentLocationContext && !isInCosmicMode) {
			e.preventDefault();
			e.stopPropagation();
			
			if (mapZoom <= 0.5 && e.deltaY > 0) {
				isInCosmicMode = true;
				toggleMapInteractivity(false);
				virtualZoom = mapZoom;
				return;
			}
			
			let delta = e.deltaY;
			if (e.deltaMode === 1) delta *= 40;
			else if (e.deltaMode === 2) delta *= 800;

			const zoomDelta = delta * -0.005;
			const newZoom = Math.max(0.5, Math.min(22, mapZoom + zoomDelta));
			
			// Lock the zoom to center strictly on the active wandering location
			map.jumpTo({
				center: [currentLocationContext.lng, currentLocationContext.lat],
				zoom: newZoom
			});
			return;
		}
		
		// Determine if we should enter cosmic mode
		// Enter when map zoom is at/below 0.5 and user is zooming out
		if (!isInCosmicMode && mapZoom <= 0.5 && e.deltaY > 0) {
			isInCosmicMode = true;
			toggleMapInteractivity(false);
			virtualZoom = mapZoom;
		}
		
		// If in cosmic mode, handle virtual zoom
		if (isInCosmicMode) {
			e.preventDefault();
			e.stopPropagation();
			
			// Scroll speed normalization
			const delta = e.deltaY * 0.003;
			virtualZoom = Math.max(-2.5, Math.min(0.5, virtualZoom - delta));
			
			// Exit cosmic mode when zooming back in past threshold
			if (virtualZoom >= 0.5) {
				isInCosmicMode = false;
				virtualZoom = 0.5;
				if (appState === 'idle' || appState === 'arrived' || appState === 'wandering') {
					toggleMapInteractivity(true);
				}
				// Sync map zoom
				map.jumpTo({ zoom: 0.5 });
			}
		}
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

			if (e.code === 'KeyQ' && appState === 'wandering' && map) {
				stopExploration();
				returnToCountry();
				return;
			}

			if (e.code === 'Space' && map && appState !== 'zooming_out' && appState !== 'zooming_in') {
				e.preventDefault(); // prevent scroll
				
				// If in cosmic mode, zoom back to map first
				if (isInCosmicMode) {
					isInCosmicMode = false;
					virtualZoom = 13;
				}
				
				if (appState === 'wandering') {
					stopExploration();
					currentLocationContext = null;
				}
				appState = 'zooming_out';
				toggleMapInteractivity(false);

				map.flyTo({
					center: homeLocation,
					zoom: 13,
					speed: 0.8,     // slightly slower for "cinematic" feel
					curve: 1,       // smooth zoom-out-in curve
					essential: true
				});
				
				map.once('moveend', () => {
					if (appState === 'zooming_out') {
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
				style: SATELLITE_STYLE as any,
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
				if (map) {
					currentZoom = map.getZoom();
					// Keep virtualZoom in sync when map controls zoom
					if (!isInCosmicMode) {
						virtualZoom = currentZoom;
					}
				}
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

		// ── Cosmic zoom wheel listener (capture phase to intercept before map) ──
		const perspectiveContainer = document.querySelector('.perspective-container');
		if (perspectiveContainer) {
			perspectiveContainer.addEventListener('wheel', handleCosmicWheel as EventListener, { passive: false, capture: true });
		}

		// ── Cleanup on component destroy ──────────────────────────────────────
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			if (perspectiveContainer) {
				perspectiveContainer.removeEventListener('wheel', handleCosmicWheel as EventListener, { capture: true });
			}
			stopExploration();
			map?.remove();
			map = null;
		};
	});

	const handleSearch = async (e: KeyboardEvent) => {
		if (e.key === 'Enter' && searchQuery.trim().length > 0 && map && (appState === 'idle' || appState === 'arrived' || appState === 'wandering')) {
			if (appState === 'wandering') {
				stopExploration();
				currentLocationContext = null;
			}
			isSearching = true;
			
			// If in cosmic mode, return to map first
			if (isInCosmicMode) {
				isInCosmicMode = false;
				virtualZoom = 13;
			}
			
			try {
				const query = encodeURIComponent(searchQuery);
				const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=1`);
				const data = await res.json();
				if (data && data.length > 0) {
					const { lat, lon, address } = data[0];
					const destination: [number, number] = [parseFloat(lon), parseFloat(lat)];
					
					countryOverviewCenter = destination;
					lastSearchQuery = searchQuery;
					lastCountryCode = address?.country_code || null;

					appState = 'zooming_out';
					
					// Disable interactivity directly here since map is available
					map.dragPan.disable();
					map.scrollZoom.disable();
					map.doubleClickZoom.disable();
					map.touchZoomRotate.disable();
					map.keyboard.disable();

					// Stage 1: Zoom out to space view (Earth visible)
					map.flyTo({
						zoom: 0, // Triggers space view (virtualZoom < 1.5 fading)
						speed: 0.4, // Slightly slower for epic cinematic feel
						curve: 1.2, // Smoother curve
						pitch: 0,
						essential: true
					});
					
					map.once('moveend', () => {
						if (appState === 'zooming_out') {
							appState = 'zooming_in';
							
							// Stage 2: Zoom in to target destination
							map.flyTo({
								center: destination,
								zoom: 5.5, // A good overview zoom for an average country
								speed: 0.4,
								curve: 1.2,
								pitch: 25,
								essential: true
							});
							
							map.once('moveend', () => {
								if (appState === 'zooming_in') {
									appState = 'arrived';
									toggleMapInteractivity(true);
									// User can now freely navigate or start wandering
								}
							});
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

	<!-- Location Context Overlay -->
	{#if appState === 'wandering' && currentLocationContext}
		<div class="location-context">
			<div class="context-city">{currentLocationContext.city}</div>
			<div class="context-region">
				{#if currentLocationContext.state}{currentLocationContext.state}, {/if}
				{currentLocationContext.country}
				{#if currentLocationContext.distanceFromHome !== undefined}
					<span class="context-distance">— about {currentLocationContext.distanceFromHome} km away</span>
				{/if}
			</div>
		</div>
	{/if}

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
				disabled={!(appState === 'idle' || appState === 'arrived' || appState === 'wandering') || isSearching}
			/>
			{#if isSearching}
				<div class="search-spinner"></div>
			{/if}
			{#if appState !== 'idle' && appState !== 'arrived'}
				<div class="state-indicator">
					{appState === 'zooming_out' || appState === 'zooming_in' ? 'Traveling...' : 
					 appState === 'returning' ? 'Returning...' : 'Wandering...'}
				</div>
			{/if}
			{#if appState === 'arrived'}
				<button class="wander-btn" onclick={() => {
					appState = 'wandering';
					startExploration();
				}}>Wander</button>
			{/if}
		</div>
	</div>

	<!-- Layer: Starfield (deepest) -->
	<Starfield visible={starfieldVisible} />

	<!-- Layer: 3D Globe + Solar System -->
	<GlobeScene visible={globeVisible} progress={solarProgress} interactive={cosmicInteractive} />

	<!-- Layer: Map -->
	<div class="layer map-wrap" style="opacity: {mapOpacity}; pointer-events: {isInCosmicMode ? 'none' : 'all'};">
		<div bind:this={mapContainer} class="map" />
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

	/* ── Location Context ----------------------------------------------------- */
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
		pointer-events: none; /* Default layer behavior */
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
		margin-left: 12px;
		transition: all 0.2s;
	}
	.wander-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	/* ── Layer 2: Map --------------------------------------------------------- */
	.map-wrap {
		z-index: 10;
		pointer-events: all; /* Important: Map must receive events */
		will-change: opacity;
		transition: opacity 0.6s ease;
	}

	.map {
		width: 100%;
		height: 100%;
	}

	/* Subtle glass overlay on top of map removed for clarity */

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
