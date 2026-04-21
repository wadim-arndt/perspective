<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	// ─── Fallback coordinates (Berlin) ────────────────────────────────────────
	const BERLIN: [number, number] = [13.405, 52.52];

	// Free MapLibre-compatible dark style via OpenMapTiles / CARTO Basemaps
	// No token required.
	const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

	let mapContainer: HTMLDivElement;
	let map: MapLibreMap | null = null;

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

<!-- Full-screen map wrapper -->
<div class="map-wrap">
	<div bind:this={mapContainer} class="map" />
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

	/* ── Map container -------------------------------------------------------- */
	.map-wrap {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
	}

	.map {
		width: 100%;
		height: 100%;
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
