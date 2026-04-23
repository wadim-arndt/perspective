import { perspectiveState } from './usePerspectiveState.svelte';
import { geocodingService } from '../services/geocoding';
import { calculateDistance } from '../utils/geo';
import { BERLIN } from '../constants';

export function useWandering() {
	let exploreTimeout: ReturnType<typeof setTimeout> | null = null;
	let driftAnimationId: number | null = null;
	let isCancelled = false;

	const stop = () => {
		isCancelled = true;
		if (exploreTimeout) clearTimeout(exploreTimeout);
		if (driftAnimationId) cancelAnimationFrame(driftAnimationId);
		perspectiveState.map?.stop();
	};

	const returnToCountry = () => {
		if (!perspectiveState.map || !perspectiveState.countryOverviewCenter) return;
		perspectiveState.setAppState('returning');
		
		perspectiveState.map.flyTo({
			center: perspectiveState.countryOverviewCenter,
			zoom: 5.5,
			speed: 0.8,
			curve: 1.2,
			pitch: 35,
			bearing: 0,
			essential: true
		});

		perspectiveState.map.once('moveend', () => {
			if (perspectiveState.appState === 'returning') {
				perspectiveState.setAppState('arrived');
				isCancelled = false;
				// Re-enable interactivity
				const methods = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard'] as const;
				methods.forEach(m => perspectiveState.map![m].enable());
			}
		});
	};

	const start = async () => {
		if (!perspectiveState.map || perspectiveState.appState !== 'wandering') return;
		isCancelled = false;
		
		let cities = await geocodingService.fetchCities(perspectiveState.lastSearchQuery, perspectiveState.lastCountryCode);
		cities = cities.filter(c => !perspectiveState.visitedCities.has(c.city));

		while (cities.length < 3) {
			const center = perspectiveState.countryOverviewCenter || BERLIN;
			let validContext = null;
			let attempts = 0;
			
			while (!validContext && attempts < 5) {
				if (isCancelled) return;
				const offsetLat = (Math.random() - 0.5) * 3;
				const offsetLng = (Math.random() - 0.5) * 3;
				validContext = await geocodingService.reverseGeocode(center[0] + offsetLng, center[1] + offsetLat);
				if (validContext && perspectiveState.visitedCities.has(validContext.city)) validContext = null;
				attempts++;
				if (!validContext) await new Promise(r => setTimeout(r, 300));
			}
			if (validContext) cities.push(validContext);
			else {
				const fallback = cities.length > 0 ? { ...cities[0] } : { lng: center[0], lat: center[1], city: 'Unknown Location', state: '', country: perspectiveState.lastCountryCode || '' };
				cities.push(fallback);
			}
		}

		cities = cities.slice(0, 3);
		if (isCancelled) {
			returnToCountry();
			return;
		}

		const visitCity = (index: number) => {
			if (isCancelled || index >= cities.length) {
				perspectiveState.setLocationContext(null);
				returnToCountry();
				return;
			}

			const context = cities[index];
			context.distanceFromHome = calculateDistance(
				perspectiveState.homeLocation[1], 
				perspectiveState.homeLocation[0], 
				context.lat, 
				context.lng
			);
			perspectiveState.setLocationContext(context);
			perspectiveState.addVisitedCity(context.city);
			
			perspectiveState.map!.flyTo({
				center: [context.lng, context.lat],
				zoom: 14 + Math.random() * 1.5,
				speed: 0.3,
				curve: 1.2,
				pitch: 45 + Math.random() * 15,
				essential: true
			});

			perspectiveState.map!.once('moveend', () => {
				if (isCancelled) return;
				
				const driftDirection = Math.random() > 0.5 ? 1 : -1;
				let lastTime = performance.now();
				
				const drift = (time: number) => {
					if (isCancelled || perspectiveState.appState !== 'wandering' || !perspectiveState.map) return;
					const dt = time - lastTime;
					lastTime = time;
					if (!perspectiveState.map.isRotating()) {
						perspectiveState.map.setBearing(perspectiveState.map.getBearing() + (1.5 * dt / 1000) * driftDirection);
					}
					driftAnimationId = requestAnimationFrame(drift);
				};
				
				if (driftAnimationId) cancelAnimationFrame(driftAnimationId);
				driftAnimationId = requestAnimationFrame(drift);

				exploreTimeout = setTimeout(() => {
					if (isCancelled) return;
					if (driftAnimationId) cancelAnimationFrame(driftAnimationId);
					visitCity(index + 1);
				}, 15000);
			});
		};

		visitCity(0);
	};

	return {
		start,
		stop,
		returnToCountry
	};
}
